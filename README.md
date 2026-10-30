# Attendance IQ

Face-verified class attendance with rotating QR codes. One deployment per lecturer. Product spec: [`docs/spec.md`](docs/spec.md). Agent rules: [`AGENTS.md`](AGENTS.md).

| Part | Where | Code |
|---|---|---|
| Web app, API, matching | Next.js on Vercel | `app/`, `lib/` |
| Database | Turso (libSQL) | `db/schema.sql` |
| Tickets, rate limits, embedding cache | Upstash Redis | `lib/redis.ts` |
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

- **QR codes** stream to each screen over Server-Sent Events (`/api/s/[id]/qr`): one long response per screen instead of a request per second. Codes are HMACs, so making and checking them touches no storage.
- **Scan → ticket** costs one Redis write. **Face check** costs one Redis read, one Turso read, the Modal call and one Turso write. Session rows are cached in memory for 5 s per server instance.
- **Modal** runs 2 checks per 2-CPU container and scales to 40 containers (about 80 checks in flight). A check takes about 1 s on Modal's CPUs (6 frames plus ~33 snapshots). Pressing Start wakes a container ahead of the rush. To go higher, raise `max_containers` in `face/app.py`.
- **Turso** client allows 200 requests in flight per server instance (`lib/db.ts`; the library default of 20 queued a whole class).
- **Duplicate check** compares against every face in the course, cached in Redis as one hash per course.
- Per-IP limits on student routes assume a whole class shares one campus IP (600–1500 per 10 minutes). Sign-in stays at 5 per 10 minutes.

Measured (October 2026):
- **App + Turso + Upstash**, face call stubbed, one local `next start`: 1000 students scanned and marked at once, all 1000 recorded exactly once; 300 phones streaming QR codes at ~1 per second.
- **Face service**, 1000 real checks fired at once from inside Modal: 996 passed (the rest were the test client's own connection errors); every check answered within ~37 s (median 31 s), under the app's 45 s limit. A real class arrives over minutes, not in one instant; for more headroom raise `max_containers`.

To measure the deployed face service yourself:

```bash
FACE_URL=... FACE_TOKEN_ID=... FACE_TOKEN_SECRET=... python face/loadtest.py face.jpg 1000
```

## Tuning the face check

The face check asks for: look straight, then turn left and right in random order, with an arrow showing which way. While it runs, the phone sends a small snapshot every 200 ms; the face service rejects the check if the face ever leaves the frame or jumps between snapshots (photos of someone swapped in front of the camera), or if a full frame isn't the picture its snapshot was taken from.

Failures log numbers only (no images) in the server log, for tuning:
- `face check failed: challenge {"left":"0.12 of 0.18", ..., "frames":"center:+0.02/0.55 ..."}`: how far each move got, and every frame's yaw/pitch.
- `face check failed: continuity {"gap":0,"shift":0.12,"scale":1.1,"turn":0.2,"same":0.7}`: the largest jumps seen between snapshots.

Vercel's Hobby plan keeps server logs for about an hour, so every face check (passes too) and every 1:1 match score is also kept in Redis (`facelog`, the last 5000, numbers only). `npm run facelog [hours]` (default a week) counts results (`ok`, `no_face`, `challenge`, `continuity`, `same_face`, `spoof`, `match`, `no_match`) and shows the spread of each score: `real` is the mean anti-spoof score (fails under `REAL`), `same` the lowest frame-to-center similarity (fails under `SAME_FACE`), `similarity` the 1:1 match (fails under `MATCH`).

Knobs at the top of `face/app.py`: `TURN` and `TILT` (how far students must move), `TRACK_*` (continuity limits), `SAME_FACE`, `REAL` (anti-spoof) and `MIN_FACE`. The match threshold is `MATCH` in `lib/face.ts` (OpenCV's published SFace value). Test `face/app.py` against photos without Modal: `python face/app.py <models dir> img1.jpg img2.jpg`.
