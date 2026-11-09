# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["opencv-python==5.0.0.93", "numpy==2.5.4", "modal==1.5.5"]  # same as Modal's image in app.py
# ///
"""Webcam bench: do a real face check with your own face, then see how it holds up in bad conditions.

    uv run face/bench.py enroll              register your face (good light), kept in face/.bench/
    uv run face/bench.py check               one live check, analysed under every filter
    uv run face/bench.py check --save NAME   ...and keep the raw capture to re-run later
    uv run face/bench.py replay NAME         re-run a saved capture (after changing a knob in app.py)

The check is the phone's (components/FaceCheck.tsx): sit at arm's length with your face in the small oval,
press SPACE, hold still for a second, then bring your face closer into the big oval while the screen
changes colour. Q quits. The laptop screen is the light source, as the phone's is, so run it full screen
with the brightness up. Captures are cut, timed, sized and JPEG-compressed like the phone's, then judged by
the same analyze() as Modal (face/app.py).
Filters fake what a phone sees in a dim hall, through a smudged lens, etc. They're applied to the raw
picture before compression, so the phone's JPEG losses come on top, as in life. Real light (a dark room, a
window behind you) still beats a filter: use both.

Everything stays on this machine. face/.bench/ and face/.models/ are gitignored.
"""

import base64
import secrets
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

# lib/schemas.ts and components/FaceCheck.tsx
COLORS = [(255, 255, 255), (255, 40, 40), (40, 255, 40), (40, 80, 255), (255, 255, 40), (255, 40, 255), (40, 255, 255)]
FLASH_MS, SEQUENCE = 400, 8
FAR_OVAL = {"x": 0.5, "y": 0.46, "w": 0.42}
FAR_MS, TRACK_MS, FAR_AT = 1000, 100, (-600, -200)
W, H, QUALITY, TRACK_W, TRACK_QUALITY = 300, 400, 75, 160, 60
SCREEN_W, SCREEN_H = 1280, 800  # the window; the preview sits in the middle, the rest is the light


def challenge():
    """lib/face.ts pickChallenge."""
    while True:
        colors = []
        while len(colors) < SEQUENCE - 1:
            c = secrets.randbelow(len(COLORS))
            if c != (colors[-1] if colors else None) and not (len(colors) == SEQUENCE - 2 and c == 0):
                colors.append(c)
        colors.append(0)
        if len({c for c in colors if c}) >= 3:
            break
    between = lambda lo, hi: round(lo + secrets.randbelow(1001) / 1000 * (hi - lo), 3)
    return colors, {"x": between(0.4, 0.6), "y": between(0.42, 0.52), "w": between(0.62, 0.74)}


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


def draw(frame, caption, oval, light=None):
    """The phone screen: mirrored preview, the oval, and the light (an RGB colour) everywhere else when on."""
    ph = SCREEN_H - 40
    pw = ph * W // H
    view = cv2.resize(cv2.flip(centre(frame), 1), (pw, ph))
    ow = int(oval["w"] * pw)
    centre_px = (int(oval["x"] * pw), int(oval["y"] * ph))
    axes = (ow // 2, int(ow * 1.37) // 2)
    mask = np.zeros((ph, pw), np.uint8)
    cv2.ellipse(mask, centre_px, axes, 0, 0, 360, 255, -1)
    fill = (np.array(light[::-1], np.uint8) if light else np.array((30, 30, 30), np.uint8))  # BGR
    view[mask == 0] = fill if light else (view[mask == 0] * 0.45).astype(np.uint8)
    cv2.ellipse(view, centre_px, axes, 0, 0, 360, (10, 10, 10) if light else (255, 255, 255), 3)
    screen = np.empty((SCREEN_H, SCREEN_W, 3), np.uint8)
    screen[:] = fill if light else (246, 244, 238)
    x0 = (SCREEN_W - pw) // 2
    screen[20 : 20 + ph, x0 : x0 + pw] = view
    cv2.rectangle(screen, (x0, 20 + ph - 56), (x0 + pw, 20 + ph), (255, 255, 255), -1)
    cv2.putText(screen, caption, (x0 + 16, 20 + ph - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (10, 10, 10), 2, cv2.LINE_AA)
    cv2.imshow("bench", screen)
    return cv2.waitKey(1) & 0xFF


def capture(cam, colors, oval):
    """Films the check like FaceCheck: raw W x H snapshots with their times, and which of them are frames."""
    cv2.namedWindow("bench", cv2.WINDOW_NORMAL)
    cv2.setWindowProperty("bench", cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
    while True:
        ok, f = cam.read()
        if not ok:
            sys.exit("Camera gave no picture.")
        key = draw(f, "Face in the small oval at arm's length, press SPACE", FAR_OVAL)
        if key == ord("q"):
            sys.exit(0)
        if key == ord(" "):
            break
    end = len(colors) * FLASH_MS
    frame_at = (*FAR_AT, end - 200, end - 100)
    pictures, times, marks = [], [], []
    flash_at = time.monotonic() * 1000 + FAR_MS
    for n in range((FAR_MS + end) // TRACK_MS):
        nominal = n * TRACK_MS - FAR_MS
        # Keep the preview and the light live between snapshots, then take the next one on the 100 ms grid.
        while True:
            t = time.monotonic() * 1000 - flash_at
            ok, f = cam.read()
            shown = COLORS[0] if t < 0 else COLORS[colors[min(int(t // FLASH_MS), len(colors) - 1)]]
            draw(f, "Hold still..." if t < 0 else "Bring your face closer to fill the oval", FAR_OVAL if t < 0 else oval, shown)
            if t >= nominal:
                break
        pictures.append(centre(f))
        times.append(round(t))
        if nominal in frame_at:
            marks.append(n)
    cv2.destroyAllWindows()
    return pictures, times, marks


def judge(c, fx, enrolled):
    seen = [fx(p) for p in c["pictures"]]
    track = [jpeg(p, TRACK_W, TRACK_QUALITY) for p in seen]
    frames = [jpeg(seen[i], W, QUALITY) for i in c["marks"]]
    rgb = [list(COLORS[i]) for i in c["colors"]]
    r = app.analyze(app.models(str(MODELS)), frames, track, c["marks"], c["times"], rgb, c["oval"])
    if r.get("ok") and enrolled is not None:
        r["similarity"] = round(float(np.frombuffer(base64.b64decode(r["embedding"]), "<f4") @ enrolled), 3)
    return r


def report(c, enrolled):
    size = sum(len(jpeg(c["pictures"][i], W, QUALITY)) for i in c["marks"]) + sum(len(jpeg(p, TRACK_W, TRACK_QUALITY)) for p in c["pictures"])
    print(f"\n{len(c['pictures'])} snapshots, {len(c['marks'])} frames, ~{size * 4 // 3 // 1024} KB as the phone would send it")
    print(f"{'filter':<12} {'result':<12} {'match':<12} scores")
    for name, fx in FILTERS.items():
        r = judge(c, fx, enrolled)
        sim = r.get("similarity")
        match = "" if sim is None else f"{sim} {'yes' if sim >= MATCH else 'NO'}"
        print(f"{name:<12} {'pass' if r.get('ok') else r.get('reason', '?'):<12} {match:<12} {r.get('detail', {})}")


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
        d = np.load(BENCH / f"{sys.argv[2]}.npz", allow_pickle=True)
        return report({k: d[k].tolist() if k != "pictures" else list(d[k]) for k in d.files} | {"oval": d["oval"].item()}, enrolled)

    cam = cv2.VideoCapture(0)
    cam.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    if not cam.isOpened():
        sys.exit("No camera at /dev/video0.")
    colors, oval = challenge()
    pictures, times, marks = capture(cam, colors, oval)
    cam.release()
    c = {"pictures": pictures, "times": times, "marks": marks, "colors": colors, "oval": oval}

    if cmd == "enroll":
        r = judge(c, FILTERS["clean"], None)
        if not r.get("ok"):
            sys.exit(f"Enrol failed: {r}")
        np.save(me, np.frombuffer(base64.b64decode(r["embedding"]), "<f4"))
        return print(f"Enrolled. Scores {r['detail']}")
    if enrolled is None:
        print("Not enrolled yet (uv run face/bench.py enroll): the match column stays empty.")
    if "--save" in sys.argv:
        name = sys.argv[sys.argv.index("--save") + 1]
        np.savez_compressed(BENCH / f"{name}.npz", pictures=np.array(pictures), times=times, marks=marks, colors=colors, oval=np.array(oval, dtype=object))
        print(f"saved face/.bench/{name}.npz")
    report(c, enrolled)


if __name__ == "__main__":
    main()
