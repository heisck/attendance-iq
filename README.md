# Attendance IQ

Face-verified class attendance with rotating QR codes. One deployment per lecturer. Product spec: [`docs/spec.md`](docs/spec.md). Agent rules: [`AGENTS.md`](AGENTS.md).

| Part | Where | Code |
|---|---|---|
| Web app, API, matching | Next.js on Vercel | `app/`, `lib/` |
| Database | Turso (libSQL) | `db/schema.sql` |
| Tickets, rate limits, face-check log | Upstash Redis | `lib/redis.ts` |
| Liveness, anti-spoof, embeddings | Modal (CPU) | `face/app.py` |

## Run locally

```bash
npm install
cp .env.example .env.local        # fill it in (see below)
npm run db:migrate                # creates local.db
npm run dev
```

Dev values for `.env.local`:

- `TURSO_DATABASE_URL=file:local.db`
- Redis: Upstash's REST shim over a local Redis.
  ```bash
  podman pod create --name aiq-redis -p 127.0.0.1:8079:80
  podman run -d --pod aiq-redis docker.io/library/redis:7-alpine
  podman run -d --pod aiq-redis -e SRH_MODE=env -e SRH_TOKEN=dev -e SRH_CONNECTION_STRING=redis://localhost:6379 docker.io/hiett/serverless-redis-http:latest
  ```
  then `UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079` and `UPSTASH_REDIS_REST_TOKEN=dev`. (Docker works the same way.)
- Face service: the deployed Modal URL and token (below). Camera access on a real phone needs HTTPS, so test student pages on a Vercel preview, or set `NEXT_PUBLIC_DEV_ALLOW_DESKTOP=true` to use a laptop webcam on localhost.

Checks: `npm test` (QR signing, timing rules, CSV), `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Deploy

1. **Face service.** `modal deploy face/app.py` (needs the [Modal CLI](https://modal.com/docs/guide) signed in). It prints the endpoint URL, shaped like `https://<workspace>--attendance-iq-face-face-check.<region>.modal.run`; it's also on the app's page at modal.com → Apps → attendance-iq-face. In modal.com → Settings → Proxy Auth Tokens, create a token. Set `FACE_URL`, `FACE_TOKEN_ID` and `FACE_TOKEN_SECRET`. Calls without the token are refused by Modal before any container starts.
2. **Database.** Create a Turso database, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, then run `npm run db:migrate` with those in `.env.local`.
3. **Redis.** Create an Upstash Redis database; set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. **Vercel.** Import the repo and add every variable from `.env.example` (leave `NEXT_PUBLIC_DEV_ALLOW_DESKTOP` empty).

## How it holds up with a full class (1000 students at once)

- **QR codes** are made by each screen itself (`lib/code.ts`), keyed per node, so showing them costs no requests. Checking one is an HMAC on the server, with no storage.
- **Scan → ticket** stores nothing (the ticket is sealed). **Face check** costs a Redis try counter, one Turso query (every registered face in the course, one row each, for the match), the Modal call and one Turso write. Session rows are cached in memory for 5 s per server instance.
- **Modal** runs 2 checks per 2-CPU container and scales to 40 containers (about 80 checks in flight). A check takes about 1 s on Modal's CPUs (4 frames plus ~42 snapshots; not yet re-measured for the colour-flash check). Pressing Start wakes a container ahead of the rush. To go higher, raise `max_containers` in `face/app.py`.
- **Turso** client allows 200 requests in flight per server instance (`lib/db.ts`; the library default of 20 queued a whole class).
- **Duplicate check** compares against every face in the course, read fresh from Turso (one row per registered student).
- **Counts** (roster size, faces registered, marks per session) are counter columns kept exact by triggers in `db/schema.sql`, so lecturer pages read one row per session instead of counting every mark ever taken. `npm run db:migrate` also recounts them from scratch.
- **Live view** polls every 3 s while its tab is visible: two rows when nothing changed; the per-phone list is re-read only when the count moves.
- Per-IP limits on student routes assume a whole class shares one campus IP (600–1500 per 10 minutes). Sign-in stays at 5 per 10 minutes.

Measured (October 2026):
- **App + Turso + Upstash**, face call stubbed, one local `next start`: 1000 students scanned and marked at once, all 1000 recorded exactly once; 300 phones streaming QR codes at ~1 per second.
- **Face service**, 1000 real checks fired at once from inside Modal: 996 passed (the rest were the test client's own connection errors); every check answered within ~37 s (median 31 s), under the app's 45 s limit. A real class arrives over minutes, not in one instant; for more headroom raise `max_containers`.

To measure the deployed face service yourself:

```bash
FACE_URL=... FACE_TOKEN_ID=... FACE_TOKEN_SECRET=... python face/loadtest.py face.jpg 1000
```

## Tuning the face check

The face check (`face/app.py` explains it in full): at arm's length in a small oval, then the screen shows the ticket's 8 colours while the student brings the phone closer into an oval the server placed. The phone sends a snapshot every 100 ms with its time, plus 2 far and 2 close frames. The face service fails the check on: `no_face` / `continuity` (the face left or jumped between snapshots), `approach` (it didn't grow into the oval), `flash` (its colour didn't follow the screen's), `spoof` (no 3D change coming closer, or the anti-spoof model), `same_face`. `FLASH` and `DEPTH` are `None` for now (shadow mode: scored and logged, never failing a check) until real phone checks give them a bar; `depth` is logged with its two parts, `spread` and `nose`.

Every check's scores go to the server log and to Redis (`facelog`, the last 5000, numbers only, since Vercel's Hobby plan keeps logs about an hour). `npm run facelog [hours]` (default a week) counts results and shows each score's spread:
- per check: `closer` (face growth, fails under `CLOSER`), `oval` and `fit` (distance from and size against the oval, `OVAL_SHIFT`, `OVAL_FIT`), `depth` (`DEPTH`), `flash` (`FLASH`) and `lag` (how far the camera ran behind the screen), `same` (`SAME_FACE`), `real` (`REAL`), and the continuity numbers `gap`, `shift`, `scale`, `turn`, `same`;
- at attendance: `match` (by `face` or by `index`), `no_match` and `need_index`, with `top` (best similarity), `margin` (best minus runner-up) and `course` (registered faces searched). Too many `need_index` means `MATCH_1N` / `MARGIN` in `lib/face.ts` are too strict for the class; a wrong match reported by a student means too loose.

Knobs are at the top of `face/app.py`; the match bars are `MATCH`, `MATCH_1N` and `MARGIN` in `lib/face.ts` (the 1:N values come from SFace on the LFW dataset; the comment there has the numbers). The flash and depth maths have a self-check: `uv run --with opencv-python-headless==5.0.0.93 --with numpy==2.5.4 --with modal==1.5.5 python face/app.py`.

**Webcam bench** (needs [uv](https://docs.astral.sh/uv/) and a webcam): a live face check with your own face (the laptop screen does the flashing, so run it bright), captured, timed and compressed exactly like the phone, judged by the same `analyze()` as Modal, then re-judged under filters that fake bad conditions (dim, dark, smudged lens, shaky hand, cheap camera, backlit). `uv run face/bench.py enroll` once in good light, then `uv run face/bench.py check` (add `--save NAME` to keep the capture) and `uv run face/bench.py replay NAME` to re-run a saved capture after changing a knob. Captures and models stay in `face/.bench/` and `face/.models/` (gitignored). Filters don't replace a real dark room; use both.
