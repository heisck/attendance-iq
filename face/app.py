"""Face liveness + embedding on Modal. Stateless: frames in, verdict and embedding out.

Models (all run through OpenCV's DNN module on CPU, permissive licenses):
  YuNet       face box + 5 landmarks             MIT         (opencv_zoo)
  SFace       128-d face embedding               Apache-2.0  (opencv_zoo)
  MiniFASNet  print / screen anti-spoof          MIT         (yakhyo/face-anti-spoofing, from minivision Apache-2.0)

The check (components/FaceCheck.tsx films it, the ticket fixes the challenge):
  1. far    about a second in a small oval, the screen white. Two sharp frames.
  2. flash  the screen shows a random colour sequence the server picked, while the student brings the
            phone closer until their face fills a big oval (centred, random size). Two sharp frames at the end.
  A small snapshot every 100 ms through both, each with its time from the flash start.
Then, all on the server:
  continuity  one face in every snapshot, never jumping (photos swapped in front of the camera fail)
  approach    the face grew and ended up in the oval the server picked (a pre-recorded clip doesn't line up)
  depth       coming closer changed the face's proportions the way a real head does; a photo or a screen
              only gets bigger (perspective: the nose is nearer the lens than the cheeks)
  flash       the face's colour followed the screen's colour sequence (a replayed video or a virtual camera
              can't, it never saw those colours); measured against the background, which the screen
              barely lights, so the camera's auto white balance cancels out
  spoof       MiniFASNet V2 and V1SE (a wider crop, which can take in a held-up phone's edges) on the far frames
  same face   every sharp frame is the same person as the close frames, whose mean is the embedding

Deploy:  modal deploy face/app.py
Bench:   uv run face/bench.py (your webcam, judged by analyze() below)
"""

import base64
import threading

import modal

MODELS = {
    "yunet.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "sface.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    "fas.onnx": "https://github.com/yakhyo/face-anti-spoofing/releases/download/weights/MiniFASNetV2.onnx",
    "fas2.onnx": "https://github.com/yakhyo/face-anti-spoofing/releases/download/weights/MiniFASNetV1SE.onnx",
}

# Tuning knobs. Provisional until the bench and real classes give numbers; every result carries its scores.
FAR = 2  # the first FAR frames are the far ones, the rest the close ones
W, H = 300, 400  # sharp frame size (FaceCheck.tsx); the oval is in these coordinates, as a share
CLOSER = 1.35  # min growth of the face's width, far frames to close frames
OVAL_SHIFT = 0.12  # max distance of the close face's centre from the oval's centre, as a share of the frame
OVAL_FIT = (0.55, 1.3)  # close face width over oval width
# Min perspective change coming closer (see depth()); a flat picture shows about 0. None = shadow mode, like
# FLASH: real checks scored +0.10, +0.04 and -0.01 from YuNet's 5 landmarks, too noisy to enforce yet.
DEPTH = None
FLASH_MS = 400  # each colour's time on screen (FaceCheck.tsx)
# Min correlation between the face's colour and the screen's. None = shadow mode: scored and logged on every
# check but not enforced. The first bench runs (a laptop screen ~60 cm away, room lights on) saw no colour on
# the face at all; set a bar once phone checks in the real app show live faces scoring clearly above replays.
FLASH = None
LAGS = range(0, 401, 50)  # ms the camera may run behind the screen
SAME_FACE = 0.20  # min cosine between any frame and the mean embedding (close-up distortion scores lower)
REAL = 0.50  # min mean anti-spoof "real" probability over the far frames (both models averaged)
MIN_FACE = 64  # px in a sharp frame; smaller faces are too far away to judge (a far face filling the small oval is ~80)
# Continuity: one face in every snapshot (every 100 ms), never leaving and never jumping.
TRACK_GAP = 2  # snapshots in a row allowed without a face (a blur); a hand swapping photos hides it longer
TRACK_SHIFT = 0.5  # max move of the face centre between snapshots, in face widths (a quick real approach hit
# 0.33 on a phone; a photo swap jumps a face width or more, or loses the face)
TRACK_SCALE = 1.5  # max change in face size between snapshots (coming closer is gradual)
TRACK_TURN = 0.6  # max yaw change between snapshots (eye distances)
TRACK_SAME = 14.0  # max mean grey-level difference between a frame and the snapshot taken with it (0-255)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("opencv-python-headless==5.0.0.93", "numpy==2.5.4", "fastapi[standard]==0.162.0")
    .run_commands(
        "mkdir -p /models",
        *[f"python -c \"import urllib.request as u; u.urlretrieve('{url}', '/models/{name}')\"" for name, url in MODELS.items()],
    )
)
app = modal.App("attendance-iq-face", image=image)

with image.imports():
    import cv2
    import numpy as np
    from fastapi import HTTPException


class Models:
    """One set per thread: cv2.dnn nets are not safe to share across concurrent inputs."""

    def __init__(self, path: str):
        self.det = cv2.FaceDetectorYN.create(f"{path}/yunet.onnx", "", (320, 320), 0.8)
        self.rec = cv2.FaceRecognizerSF.create(f"{path}/sface.onnx", "")
        self.fas = cv2.dnn.readNetFromONNX(f"{path}/fas.onnx")
        self.fas2 = cv2.dnn.readNetFromONNX(f"{path}/fas2.onnx")


_local = threading.local()


def models(path="/models") -> Models:
    if not hasattr(_local, "m"):
        _local.m = Models(path)
    return _local.m


def decode(jpeg: bytes):
    return cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)


def detect(m: Models, img):
    """The biggest face: box and landmarks (right eye, left eye, nose, right and left mouth corner), or None."""
    h, w = img.shape[:2]
    m.det.setInputSize((w, h))
    _, faces = m.det.detect(img)
    return None if faces is None else max(faces, key=lambda f: f[2] * f[3])


def shape(face):
    """Where the face is and its proportions: centre, size, yaw and the two depth ratios."""
    x, y, bw, bh = face[:4]
    eye_r, eye_l, nose = face[4:10].reshape(3, 2)
    eyes = (eye_r + eye_l) / 2
    eye_dist = max(float(np.linalg.norm(eye_l - eye_r)), 1.0)
    return {
        "x": float(x + bw / 2),
        "y": float(y + bh / 2),
        "w": float(bw),
        "h": float(bh),
        "yaw": float((nose[0] - eyes[0]) / eye_dist),
        # Coming closer, the eyes (near the lens) grow faster than the face outline (cheeks, further back),
        # and the nose tip (nearest) drops further below the eyes. A flat picture keeps both ratios.
        "spread": eye_dist / float(bw),
        "nose": float(nose[1] - eyes[1]) / eye_dist,
    }



def frame(m: Models, img):
    face = detect(m, img)
    if face is None or min(face[2], face[3]) < MIN_FACE:
        return None
    emb = m.rec.feature(m.rec.alignCrop(img, face)).flatten()
    v2, v1se = real(m.fas, img, face, 2.7), real(m.fas2, img, face, 4.0)
    return {**shape(face), "emb": emb / np.linalg.norm(emb), "v2": v2, "v1se": v1se, "real": (v2 + v1se) / 2}


def real(net, img, face, scale: float) -> float:
    """MiniFASNet: a box crop `scale` times the face (as far as the picture allows), 80x80, BGR, raw 0-255
    floats; class 1 = real. V2 takes 2.7x, V1SE 4.0x, as the Silent-Face models were trained."""
    h, w = img.shape[:2]
    x, y, bw, bh = face[:4]
    s = min((h - 1) / bh, (w - 1) / bw, scale)
    cx, cy = x + bw / 2, y + bh / 2
    x1, y1 = max(0, int(cx - bw * s / 2)), max(0, int(cy - bh * s / 2))
    x2, y2 = min(w - 1, int(cx + bw * s / 2)), min(h - 1, int(cy + bh * s / 2))
    crop = cv2.resize(img[y1 : y2 + 1, x1 : x2 + 1], (80, 80)).astype(np.float32)
    net.setInput(crop.transpose(2, 0, 1)[None])
    logits = net.forward()[0]
    p = np.exp(logits - logits.max())
    return float(p[1] / p.sum())


def grey(img, size=(30, 40)):
    return cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), size, interpolation=cv2.INTER_AREA).astype(np.float32)


def continuity(pts, thumbs, frames, marks) -> dict | None:
    """None if the snapshots show one face throughout; else the failure with its numbers."""
    # Each full frame must be the very picture its snapshot was taken from.
    same = max(float(np.abs(grey(f) - grey(thumbs[i])).mean()) for f, i in zip(frames, marks))
    gap = run = 0
    for p in pts:
        run = 0 if p else run + 1
        gap = max(gap, run)
    # Each found face against the previous found one; limits scale with the snapshots between them.
    shift = scale = turn = 0.0
    prev = None
    for i, p in enumerate(pts):
        if not p:
            continue
        if prev:
            j, q = prev
            k = i - j
            shift = max(shift, float(np.hypot(p["x"] - q["x"], p["y"] - q["y"]) / ((p["w"] + q["w"]) / 2) / k))
            scale = max(scale, (max(p["w"], q["w"]) / min(p["w"], q["w"])) ** (1 / k))
            turn = max(turn, abs(p["yaw"] - q["yaw"]) / k)
        prev = (i, p)
    detail = {"gap": gap, "shift": round(shift, 2), "scale": round(scale, 2), "turn": round(turn, 2), "same": round(same, 1)}
    if gap > TRACK_GAP:
        return {"ok": False, "reason": "no_face", "detail": detail}
    if shift > TRACK_SHIFT or scale > TRACK_SCALE or turn > TRACK_TURN or same > TRACK_SAME:
        return {"ok": False, "reason": "continuity", "detail": detail}
    return None


def flash(pts, thumbs, times, colors) -> tuple[float, int]:
    """How well the face's colour followed the screen's: the best correlation over the camera lags, and that lag."""
    obs, ts = [], []
    for p, img, t in zip(pts, thumbs, times):
        if not p:
            continue
        h, w = img.shape[:2]
        # Cheeks and nose (the box centre sits about on the nose), against everything well clear of the face.
        fx1, fx2 = int(p["x"] - p["w"] / 4), int(p["x"] + p["w"] / 4)
        fy1, fy2 = int(p["y"] - p["h"] / 10), int(p["y"] + p["h"] * 0.3)
        face = img[max(fy1, 0) : max(fy2, 1), max(fx1, 0) : max(fx2, 1)].reshape(-1, 3)
        mask = np.ones((h, w), bool)
        mask[max(int(p["y"] - p["h"] * 0.8), 0) : int(p["y"] + p["h"] * 0.8), max(int(p["x"] - p["w"] * 0.7), 0) : int(p["x"] + p["w"] * 0.7)] = False
        if len(face) < 9 or mask.mean() < 0.05:
            continue
        # Over the background: the camera's white balance and exposure scale both alike, so they cancel.
        rgb = (face.mean(0) + 1) / (img[mask].mean(0) + 1)
        obs.append(rgb[::-1] / rgb.sum())  # chromaticity, RGB order: brightness (and distance) drop out
        ts.append(t)
    if len(obs) < 10:
        return 0.0, 0
    obs = np.array(obs)
    ts = np.array(ts)
    # Before the flash the screen is white; after it, it stays on the last colour.
    shown = np.array([[255, 255, 255], *colors], np.float32)
    shown = (shown + 1) / (shown + 1).sum(1, keepdims=True)
    best = (0.0, 0)
    for lag in LAGS:
        idx = np.clip(np.floor((ts - lag) / FLASH_MS).astype(int) + 1, 0, len(colors))
        exp = shown[idx]
        rs = [np.corrcoef(obs[:, c], exp[:, c])[0, 1] for c in range(3) if exp[:, c].std() > 1e-6 and obs[:, c].std() > 1e-9]
        r = float(np.mean(rs)) if rs else 0.0
        if r > best[0]:
            best = (r, lag)
    return best


def depth(far, close) -> tuple[float, float]:
    """Relative growth of the two depth ratios from far to close, (spread, nose); 0 for a flat picture."""
    grow = lambda k: float(np.mean([s[k] for s in close]) / np.mean([s[k] for s in far]) - 1)
    return grow("spread"), grow("nose")



def analyze(m: Models, frames: list[bytes], track: list[bytes], marks: list[int], times: list[int], colors: list[list[int]], oval: dict) -> dict:
    """frames: FAR far ones, then close ones. track: snapshots, times: each one's ms from the flash start.
    marks: the snapshot each frame was taken with. colors: the RGB sequence shown. oval: where the close
    face had to end up, {x, y, w} as shares of the mirrored preview (what the student saw)."""
    thumbs = [decode(t) for t in track]
    full = [decode(f) for f in frames]
    if any(t is None for t in thumbs + full):
        return {"ok": False, "reason": "continuity", "detail": {"error": "bad picture"}}
    pts = [None if (f := detect(m, t)) is None else shape(f) for t in thumbs]
    broken = continuity(pts, thumbs, full, marks)
    if broken:
        return broken

    seen = [frame(m, f) for f in full]
    if any(s is None for s in seen):
        return {"ok": False, "reason": "no_face", "detail": {"missing": f"{sum(s is None for s in seen)} of {len(seen)}"}}
    far, close = seen[:FAR], seen[FAR:]

    # The preview is mirrored, the frames aren't: the oval's x flips.
    ox, oy, ow = (1 - oval["x"]) * W, oval["y"] * H, oval["w"] * W
    cx, cy, cw = (np.mean([s[k] for s in close]) for k in ("x", "y", "w"))
    r, lag = flash(pts, thumbs, times, colors)
    # The embedding from the close frames: a big face, lit white. Far ones only have to be the same person.
    emb = np.mean([s["emb"] for s in close], axis=0)
    emb = emb / np.linalg.norm(emb)
    # The scores go back on every outcome, so passes show their margins too.
    scores = {
        "closer": round(float(cw / np.mean([s["w"] for s in far])), 2),
        "oval": round(float(np.hypot((cx - ox) / W, (cy - oy) / H)), 3),
        "fit": round(float(cw / ow), 2),
        "depth": round(sum(d := depth(far, close)) / 2, 3),
        "spread": round(d[0], 3),
        "nose": round(d[1], 3),
        "flash": round(r, 3),
        "lag": lag,
        "same": round(min(float(s["emb"] @ emb) for s in seen), 3),
        "real": round(float(np.mean([s["real"] for s in far])), 3),
        "v2": round(float(np.mean([s["v2"] for s in far])), 3),
        "v1se": round(float(np.mean([s["v1se"] for s in far])), 3),
    }
    if scores["closer"] < CLOSER or scores["oval"] > OVAL_SHIFT or not OVAL_FIT[0] <= scores["fit"] <= OVAL_FIT[1]:
        return {"ok": False, "reason": "approach", "detail": scores}
    if scores["same"] < SAME_FACE:
        return {"ok": False, "reason": "same_face", "detail": scores}
    if FLASH is not None and scores["flash"] < FLASH:
        return {"ok": False, "reason": "flash", "detail": scores}
    if (DEPTH is not None and scores["depth"] < DEPTH) or scores["real"] < REAL:
        return {"ok": False, "reason": "spoof", "detail": scores}

    return {"ok": True, "embedding": base64.b64encode(emb.astype("<f4").tobytes()).decode(), "detail": scores}


def valid(body: dict) -> bool:
    frames, track, marks, times, colors, oval = (body.get(k) for k in ("frames", "track", "marks", "times", "colors", "oval"))
    return (
        isinstance(frames, list)
        and FAR < len(frames) <= 8
        and all(isinstance(f, str) and len(f) <= 100_000 for f in frames)
        and isinstance(track, list)
        and 10 <= len(track) <= 60
        and all(isinstance(t, str) and len(t) <= 100_000 for t in track)
        and isinstance(marks, list)
        and len(marks) == len(frames)
        and all(isinstance(i, int) and 0 <= i < len(track) for i in marks)
        and isinstance(times, list)
        and len(times) == len(track)
        and all(isinstance(t, int) and -5_000 <= t <= 10_000 for t in times)
        and isinstance(colors, list)
        and 3 <= len(colors) <= 16
        and all(isinstance(c, list) and len(c) == 3 and all(isinstance(v, int) and 0 <= v <= 255 for v in c) for c in colors)
        and isinstance(oval, dict)
        and all(isinstance(oval.get(k), (int, float)) and 0 < oval[k] < 1 for k in ("x", "y", "w"))
    )


# ponytail: 2 CPUs x 2 inputs per container, up to 40 containers (~80 checks in flight, ~1000 students in well
# under a minute). Raise max_containers if a bigger class queues.
# Modal bills a container for as long as it is up, idle included, and checks take ~1 s: one spare container
# (not two) and a 2-minute idle window (not 5) cut most of the idle bill. Start wakes one ahead of the rush.
@app.cls(cpu=2.0, memory=1024, max_containers=40, buffer_containers=1, scaledown_window=120)
@modal.concurrent(max_inputs=2)
class Face:
    @modal.enter()
    def load(self):
        cv2.setNumThreads(1)
        models()

    # POST {frames, track, marks, times, colors, oval} (see analyze) -> {ok, reason?, detail?, embedding?}
    # colors and oval come from the ticket, through Vercel, never from the phone.
    # POST {warm: true} wakes a container when the lecturer presses Start.
    # Modal's proxy auth rejects calls without the workspace's Modal-Key/Modal-Secret headers before
    # any container starts, so strangers can't spend the credits.
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def check(self, body: dict):
        if body.get("warm"):
            return {"ok": True}
        if not valid(body):
            raise HTTPException(400)
        b64 = base64.b64decode
        b = body
        return analyze(models(), [b64(f) for f in b["frames"]], [b64(t) for t in b["track"]], b["marks"], b["times"], b["colors"], b["oval"])


if __name__ == "__main__":
    # Self-check of the flash maths on synthetic snapshots (no models, no faces): `uv run face/bench.py` deps,
    #   uv run --with opencv-python-headless==5.0.0.93 --with numpy==2.5.4 --with modal==1.5.5 python face/app.py
    rng = np.random.default_rng(1)
    colors = [[255, 40, 40], [40, 255, 40], [40, 80, 255], [255, 255, 40], [255, 40, 255], [40, 80, 255], [40, 255, 40], [255, 255, 255]]
    times = list(range(-1000, 3200, 100))
    pts = [{"x": 80.0, "y": 100.0, "w": 60.0, "h": 70.0} for _ in times]

    def snapshots(lit: bool, lag=150):
        out = []
        for t in times:
            img = np.full((213, 160, 3), 110.0)
            i = int((t - lag) // FLASH_MS) + 1
            screen = np.array(([255, 255, 255], *colors)[min(max(i, 0), len(colors))], float)[::-1]  # BGR
            skin = np.array([120.0, 140.0, 190.0])  # BGR
            # A real face 30 cm from the screen catches its colour; a replayed video doesn't.
            img[65:135, 45:115] = skin * (0.7 + 0.5 * screen / 255) if lit else skin
            gain = rng.uniform(0.85, 1.15)  # auto exposure and white balance wandering, whole frame alike
            out.append(np.clip(img * gain + rng.normal(0, 3, img.shape), 0, 255).astype(np.uint8))
        return out

    live, lag = flash(pts, snapshots(True), times, colors)
    replay, _ = flash(pts, snapshots(False), times, colors)
    print(f"flash: live {live:.2f} at {lag} ms, replay {replay:.2f}")
    assert live > 0.9 and 100 <= lag <= 200, (live, lag)
    assert replay < 0.5, replay
    far = [{"spread": 0.40, "nose": 0.60}] * 2
    assert np.allclose(depth(far, [{"spread": 0.40 * 1.08, "nose": 0.60 * 1.05}] * 2), (0.08, 0.05))
    assert np.allclose(depth(far, far), (0, 0))
    print("ok")
