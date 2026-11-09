"""Load test the deployed face endpoint: N face checks at once, like a whole class.

    FACE_URL=... FACE_TOKEN_ID=... FACE_TOKEN_SECRET=... python face/loadtest.py face.jpg [N=1000]

face.jpg: one face photo about 300 px wide (what the app sends per frame). Every check reuses it as every
frame and snapshot (it fails liveness: it never comes closer), so this measures throughput and autoscaling. The photo only goes to
your own endpoint. Costs roughly N x 0.2 CPU-seconds of Modal credit.
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

url = os.environ["FACE_URL"]
headers = {"Modal-Key": os.environ["FACE_TOKEN_ID"], "Modal-Secret": os.environ["FACE_TOKEN_SECRET"], "content-type": "application/json"}
frame = base64.b64encode(open(sys.argv[1], "rb").read()).decode()
n = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
# As FaceCheck sends it: a snapshot every 100 ms (1 s far, 3.2 s of colours), 2 far and 2 close frames.
colors = [[255, 40, 40], [40, 255, 40], [40, 80, 255], [255, 255, 40], [255, 40, 255], [40, 80, 255], [40, 255, 40], [255, 255, 255]]
body = json.dumps({
    "frames": [frame] * 4, "track": [frame] * 42, "marks": [4, 8, 40, 41], "times": list(range(-1000, 3200, 100)),
    "colors": colors, "oval": {"x": 0.5, "y": 0.47, "w": 0.68},
}).encode()


def check(_):
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, body, headers), timeout=180) as r:
            out = json.load(r)
            status = "ok" if out.get("ok") else out.get("reason")
    except urllib.error.HTTPError as e:
        status = f"http {e.code}"
    except Exception as e:
        status = type(e).__name__
    return status, time.perf_counter() - t


start = time.perf_counter()
with ThreadPoolExecutor(n) as pool:
    results = list(pool.map(check, range(n)))
wall = time.perf_counter() - start

times = sorted(t for _, t in results)
print(f"{n} checks in {wall:.1f} s ({n / wall:.0f}/s)")
print("results:", dict(Counter(s for s, _ in results)))
print(f"latency p50 {times[n // 2]:.1f} s, p95 {times[int(n * 0.95)]:.1f} s, max {times[-1]:.1f} s")
