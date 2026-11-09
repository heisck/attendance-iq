# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["opencv-python==5.0.0.93", "numpy==2.5.4", "modal==1.5.5"]  # same as Modal's image in app.py
# ///
"""Webcam bench: do a real face check with your own face, then see how it holds up in bad conditions.

    uv run face/bench.py enroll              register your face (good light), kept in face/.bench/
    uv run face/bench.py check               one live check, analysed under every filter
    uv run face/bench.py check --save NAME   ...and keep the raw capture to re-run later
    uv run face/bench.py replay NAME         re-run a saved capture (after changing a knob in app.py)

The window works like the phone: mirrored preview, oval, instructions; press SPACE to start, Q to quit.
Captures are cut, sized and JPEG-compressed exactly like components/FaceCheck.tsx, then judged by the same
analyze() as Modal (face/app.py). Filters fake what a phone sees in a dim hall, through a smudged lens, etc.
They're applied to the raw picture before compression, so the phone's JPEG losses come on top, as in life.
Real light (a dark room, a window behind you) still beats a filter: use both.

Everything stays on this machine. face/.bench/ and face/.models/ are gitignored.
"""

import random
import sys
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np

import app  # face/app.py: analyze(), models(), knobs

HERE = Path(__file__).parent
MODELS = HERE / ".models"
BENCH = HERE / ".bench"
MATCH = 0.363  # lib/face.ts

# components/FaceCheck.tsx
TRACK_MS, STEP_MS, CAPTURE_AT = 200, 2200, (1200, 1800)
W, H, QUALITY, TRACK_W, TRACK_QUALITY = 300, 400, 75, 120, 60
LABEL = {"center": "Look straight at the camera", "left": "Turn your head LEFT", "right": "Turn your head RIGHT", "up": "Look UP"}


def noise(img, sigma):
    return np.clip(img.astype(np.float32) + np.random.default_rng(0).normal(0, sigma, img.shape), 0, 255).astype(np.uint8)


def dim(k, sigma):
    """Less light: the sensor gets k of it and the phone's gain adds grain."""
    return lambda img: noise((img.astype(np.float32) * k).astype(np.uint8), sigma)


def frost(img):
    """Smudged or fogged lens: soft and hazy."""
    soft = cv2.GaussianBlur(img, (0, 0), 2.5)
    return cv2.addWeighted(soft, 0.7, np.full_like(img, 200), 0.3, 0)


def shake(img):
    k = np.zeros((9, 9), np.float32)
    k[4] = 1 / 9
    return cv2.filter2D(img, -1, k)


def cheap(img):
    """A low-end front camera: a third of the detail."""
    h, w = img.shape[:2]
    return cv2.resize(cv2.resize(img, (w // 3, h // 3), interpolation=cv2.INTER_AREA), (w, h))


def backlit(img):
    """A bright window behind: the phone exposes for it and the face goes dark (darker towards the middle)."""
    h, w = img.shape[:2]
    y, x = np.ogrid[:h, :w]
    r = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2)
    gain = np.clip(0.35 + 0.9 * r, 0.35, 1.6)[..., None]
    return np.clip(img.astype(np.float32) * gain, 0, 255).astype(np.uint8)


FILTERS = {
    "clean": lambda img: img,
    "dim": dim(0.45, 5),
    "dark": dim(0.2, 8),
    "very dark": dim(0.1, 10),
    "frost": frost,
    "shake": shake,
    "cheap cam": cheap,
    "backlit": backlit,
    "dark+frost": lambda img: frost(dim(0.2, 8)(img)),
    "dark+cheap": lambda img: cheap(dim(0.2, 8)(img)),
}


def centre(img):
    """FaceCheck's centre(): the 3:4 middle of the camera frame, at W x H."""
    h, w = img.shape[:2]
    sw, sh = min(w, h * W / H), min(h, w * H / W)
    x, y = int((w - sw) / 2), int((h - sh) / 2)
    return cv2.resize(img[y : y + int(sh), x : x + int(sw)], (W, H), interpolation=cv2.INTER_AREA)


def jpeg(img, width, quality):
    if img.shape[1] != width:
        img = cv2.resize(img, (width, round(width * img.shape[0] / img.shape[1])), interpolation=cv2.INTER_AREA)
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])[1].tobytes()


def draw(frame, caption, state=None):
    """The phone screen: mirrored preview with the oval and the caption."""
    view = cv2.flip(centre(frame), 1)
    view = cv2.resize(view, (W * 2, H * 2))
    colour = (90, 200, 90) if state == "ok" else (255, 255, 255)
    cv2.ellipse(view, (W, int(H * 0.92)), (int(W * 0.55), int(H * 0.68)), 0, 0, 360, colour, 3)
    cv2.rectangle(view, (0, H * 2 - 60), (W * 2, H * 2), (20, 20, 20), -1)
    cv2.putText(view, caption, (20, H * 2 - 22), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.imshow("bench", view)
    return cv2.waitKey(1) & 0xFF


def capture(cam, challenge):
    """Films the challenge like FaceCheck: raw W x H pictures for the track, and which of them are frames."""
    while True:
        ok, f = cam.read()
        if not ok:
            sys.exit("Camera gave no picture.")
        key = draw(f, "Fit your face in the oval, press SPACE")
        if key == ord("q"):
            sys.exit(0)
        if key == ord(" "):
            break
    pictures, marks = [], []
    start = time.monotonic()
    for n in range(len(challenge) * STEP_MS // TRACK_MS):
        t = n * TRACK_MS
        # Keep the preview live between snapshots, then take the next picture on the 200 ms grid.
        while (time.monotonic() - start) * 1000 < t:
            ok, f = cam.read()
            draw(f, LABEL[challenge[t // STEP_MS]])
        pictures.append(centre(f))
        if t % STEP_MS in CAPTURE_AT:
            marks.append(n)
    draw(f, "Checking...", "ok")
    return pictures, marks


def judge(pictures, marks, challenge, fx, enrolled):
    seen = [fx(p) for p in pictures]
    track = [jpeg(p, TRACK_W, TRACK_QUALITY) for p in seen]
    frames = [jpeg(seen[i], W, QUALITY) for i in marks]
    r = app.analyze(app.models(str(MODELS)), frames, challenge, track, marks)
    if r.get("ok") and enrolled is not None:
        emb = np.frombuffer(__import__("base64").b64decode(r["embedding"]), "<f4")
        r["similarity"] = round(float(emb @ enrolled), 3)
    return r


def report(pictures, marks, challenge, enrolled):
    print(f"\nchallenge {challenge}, {len(pictures)} snapshots, frame size {sum(len(jpeg(pictures[i], W, QUALITY)) for i in marks) // 1024} KB")
    print(f"{'filter':<12} {'result':<12} {'match':<16} scores")
    for name, fx in FILTERS.items():
        r = judge(pictures, marks, challenge, fx, enrolled)
        result = "pass" if r.get("ok") else r.get("reason", "?")
        sim = r.get("similarity")
        match = "" if sim is None else f"{sim} {'yes' if sim >= MATCH else 'NO'}"
        detail = {k: v for k, v in (r.get("detail") or {}).items() if k != "frames"}
        print(f"{name:<12} {result:<12} {match:<16} {detail}")


def ensure_models():
    MODELS.mkdir(exist_ok=True)
    for name, url in app.MODELS.items():
        if not (MODELS / name).exists():
            print(f"downloading {name}")
            # Via a temp name, so an interrupted download isn't mistaken for the model next time.
            urllib.request.urlretrieve(url, MODELS / f"{name}.part")
            (MODELS / f"{name}.part").rename(MODELS / name)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd not in ("enroll", "check", "replay") or (cmd == "replay" and len(sys.argv) < 3):
        sys.exit(__doc__)
    BENCH.mkdir(exist_ok=True)
    ensure_models()
    me = BENCH / "me.npy"
    enrolled = np.load(me) if me.exists() else None

    if cmd == "replay":
        d = np.load(BENCH / f"{sys.argv[2]}.npz")
        return report(list(d["pictures"]), list(d["marks"]), list(d["challenge"]), enrolled)

    cam = cv2.VideoCapture(0)
    cam.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    if not cam.isOpened():
        sys.exit("No camera at /dev/video0.")
    # lib/face.ts pickChallenge
    challenge = ["center", "left", "right"] if random.random() < 0.5 else ["center", "right", "left"]
    pictures, marks = capture(cam, challenge)
    cam.release()

    if cmd == "enroll":
        r = judge(pictures, marks, challenge, FILTERS["clean"], None)
        if not r.get("ok"):
            sys.exit(f"Enrol failed: {r}")
        np.save(me, np.frombuffer(__import__("base64").b64decode(r["embedding"]), "<f4"))
        return print(f"Enrolled. Scores {r['detail']}")
    if enrolled is None:
        print("Not enrolled yet (uv run face/bench.py enroll): match column stays empty.")
    if "--save" in sys.argv:
        name = sys.argv[sys.argv.index("--save") + 1]
        np.savez_compressed(BENCH / f"{name}.npz", pictures=np.array(pictures), marks=marks, challenge=challenge)
        print(f"saved face/.bench/{name}.npz")
    report(pictures, marks, challenge, enrolled)


if __name__ == "__main__":
    main()
