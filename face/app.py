"""Face liveness + embedding on Modal. Stateless: frames in, verdict and embedding out.

Models (all run through OpenCV's DNN module on CPU, permissive licenses):
  YuNet       face box + 5 landmarks             MIT         (opencv_zoo)
  SFace       128-d face embedding               Apache-2.0  (opencv_zoo)
  MiniFASNet  print / screen anti-spoof          MIT         (yakhyo/face-anti-spoofing, from minivision Apache-2.0)

Deploy:  modal deploy face/app.py
Local:   python face/app.py <models dir> <image>...   (runs analyze() without Modal)
"""

import base64
import threading

import modal

MODELS = {
    "yunet.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "sface.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    "fas.onnx": "https://github.com/yakhyo/face-anti-spoofing/releases/download/weights/MiniFASNetV2.onnx",
}

# Tuning knobs. Ratios are relative to the "center" frames, so they adapt to how each phone is held.
TURN = 0.18  # nose shift sideways, in eye-distances, for "left" / "right"
TILT = 0.10  # nose shift up, in eye-to-mouth heights, for "up"
SAME_FACE = 0.20  # min cosine between any frame and the center embedding (lower than a match: turned heads score worse)
REAL = 0.50  # min mean anti-spoof "real" probability across frames
MIN_FACE = 80  # px; smaller faces are too far away to judge

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


_local = threading.local()


def models(path="/models") -> Models:
    if not hasattr(_local, "m"):
        _local.m = Models(path)
    return _local.m


def frame(m: Models, jpeg: bytes):
    img = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    h, w = img.shape[:2]
    m.det.setInputSize((w, h))
    _, faces = m.det.detect(img)
    if faces is None:
        return None
    face = max(faces, key=lambda f: f[2] * f[3])
    x, y, bw, bh = face[:4]
    if min(bw, bh) < MIN_FACE:
        return None
    # Landmarks: right eye, left eye, nose tip, right mouth corner, left mouth corner (subject's sides).
    eye_r, eye_l, nose, mouth_r, mouth_l = face[4:14].reshape(5, 2)
    eyes = (eye_r + eye_l) / 2
    mouth = (mouth_r + mouth_l) / 2
    eye_dist = max(np.linalg.norm(eye_l - eye_r), 1.0)
    yaw = (nose[0] - eyes[0]) / eye_dist
    pitch = (nose[1] - eyes[1]) / max(mouth[1] - eyes[1], 1.0)

    emb = m.rec.feature(m.rec.alignCrop(img, face)).flatten()
    emb = emb / np.linalg.norm(emb)

    # MiniFASNetV2: 2.7x box crop, 80x80, BGR, raw 0-255 floats, class 1 = real.
    s = min((h - 1) / bh, (w - 1) / bw, 2.7)
    cx, cy = x + bw / 2, y + bh / 2
    x1, y1 = max(0, int(cx - bw * s / 2)), max(0, int(cy - bh * s / 2))
    x2, y2 = min(w - 1, int(cx + bw * s / 2)), min(h - 1, int(cy + bh * s / 2))
    crop = cv2.resize(img[y1 : y2 + 1, x1 : x2 + 1], (80, 80)).astype(np.float32)
    m.fas.setInput(crop.transpose(2, 0, 1)[None])
    logits = m.fas.forward()[0]
    p = np.exp(logits - logits.max())
    real = float(p[1] / p.sum())

    return {"yaw": float(yaw), "pitch": float(pitch), "emb": emb, "real": real}


def analyze(m: Models, frames: list[bytes], challenge: list[str]) -> dict:
    """frames are grouped by challenge step, in order: len(frames) is a multiple of len(challenge)."""
    per = len(frames) // len(challenge)
    seen = [frame(m, f) for f in frames]
    if any(s is None for s in seen):
        return {"ok": False, "reason": "no_face"}

    steps = [seen[i * per : (i + 1) * per] for i in range(len(challenge))]
    center = [s for step, kind in zip(steps, challenge) if kind == "center" for s in step]
    if not center:
        return {"ok": False, "reason": "challenge"}
    yaw0 = np.mean([s["yaw"] for s in center])
    pitch0 = np.mean([s["pitch"] for s in center])

    # Frames come straight from the camera (not mirrored): turning to the subject's left moves the nose to image right.
    # How far each step moved (its best frame) against what it needs. On failure the numbers go back for tuning.
    moved = {
        "left": lambda s: s["yaw"] - yaw0,
        "right": lambda s: yaw0 - s["yaw"],
        "up": lambda s: pitch0 - s["pitch"],
    }
    need = {"left": TURN, "right": TURN, "up": TILT}
    best = {kind: round(max(moved[kind](s) for s in step), 3) for step, kind in zip(steps, challenge) if kind != "center"}
    if not all(best[k] > need[k] for k in best):
        # Every frame's yaw/pitch in step order, so a bad "center" baseline shows up too.
        frames = " ".join(f"{kind}:{s['yaw']:+.2f}/{s['pitch']:.2f}" for step, kind in zip(steps, challenge) for s in step)
        return {"ok": False, "reason": "challenge", "detail": {**{k: f"{v} of {need[k]}" for k, v in best.items()}, "frames": frames}}

    emb = np.mean([s["emb"] for s in center], axis=0)
    emb = emb / np.linalg.norm(emb)
    if min(float(s["emb"] @ emb) for s in seen) < SAME_FACE:
        return {"ok": False, "reason": "same_face"}
    if np.mean([s["real"] for s in seen]) < REAL:
        return {"ok": False, "reason": "spoof"}

    return {"ok": True, "embedding": base64.b64encode(emb.astype("<f4").tobytes()).decode()}


# ponytail: 2 CPUs x 2 inputs per container, up to 40 containers (~80 checks in flight, ~1000 students in well
# under a minute). Raise max_containers if a bigger class queues.
@app.cls(cpu=2.0, memory=1024, max_containers=40, buffer_containers=2, scaledown_window=300)
@modal.concurrent(max_inputs=2)
class Face:
    @modal.enter()
    def load(self):
        cv2.setNumThreads(1)
        models()

    # POST {challenge: ["center", "left", ...], frames: [base64 jpeg, ...]} -> {ok, reason?, embedding?}
    # POST {warm: true} wakes a container when the lecturer presses Start.
    # Modal's proxy auth rejects calls without the workspace's Modal-Key/Modal-Secret headers before
    # any container starts, so strangers can't spend the credits.
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def check(self, body: dict):
        if body.get("warm"):
            return {"ok": True}
        challenge, frames = body.get("challenge"), body.get("frames")
        if (
            not isinstance(challenge, list)
            or not 1 <= len(challenge) <= 4
            or any(c not in ("center", "left", "right", "up") for c in challenge)
            or not isinstance(frames, list)
            or not 1 <= len(frames) <= 12
            or len(frames) % len(challenge)
            or any(not isinstance(f, str) or len(f) > 100_000 for f in frames)
        ):
            raise HTTPException(400)
        return analyze(models(), [base64.b64decode(f) for f in frames], challenge)


if __name__ == "__main__":
    import sys
    import time

    m = models(sys.argv[1])
    imgs = [open(p, "rb").read() for p in sys.argv[2:]]
    for f in imgs:
        t = time.perf_counter()
        s = frame(m, f)
        print(f"{(time.perf_counter() - t) * 1000:.0f} ms", s and {k: round(v, 3) for k, v in s.items() if k != "emb"})
    print(analyze(m, imgs, ["center"]))
