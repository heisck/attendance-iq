# Attendance IQ: Product Spec

A self-hosted attendance system. Lecturers deploy their own copy. Students have no accounts: they register once per course with their face, then mark attendance by scanning a rotating QR code and passing a face + liveness check.

Status: **Live data.** Turso, Upstash and the Modal face service are wired in; setup and deploy steps are in the [README](../README.md).

## Stack

| Part | Where |
|---|---|
| Web app (lecturer + student pages, API) | Next.js on Vercel |
| Database | Turso (libSQL) |
| Scan tickets, rate limits, face-check log | Upstash Redis |
| Face liveness, face embedding | Modal (Python, CPU). Only the heavy compute lives here. |

Modal is stateless: frames and the challenge in, `{ ok, reason?, embedding? }` out (`reason` is `no_face`, `continuity`, `approach`, `flash`, `same_face` or `spoof`). Vercel does the comparison against stored embeddings and writes to Turso. Models: YuNet (face + landmarks), SFace (128-d embedding), MiniFASNetV2 (anti-spoof), all on OpenCV's DNN module on CPU.

## Who uses it

- **Lecturer.** One deployment = one lecturer. Pages are gated by an email and password set in env (`LECTURER_EMAIL`, `LECTURER_PASSWORD`). Works on any device. "Forgot password?" on sign-in links to the Vercel project's env vars (`NEXT_PUBLIC_PASSWORD_RESET_URL`), so only someone with access to that Vercel account can change them.
- **Student.** No sign-up, no sign-in, no device linked to anyone. **Phones only** (Android and iPhone). Tablets, laptops, desktops and Samsung DeX are blocked by viewport size. Dev exception: `NEXT_PUBLIC_DEV_ALLOW_DESKTOP=true`.

## Lecturer flow

1. Log in with the env password.
2. Fill one form: course, week, time window, and a toggle for **Registration** or **Attendance**. For registration, also choose **auto-approve edits** or **manual approve**.
3. Generate a link and share it with students.
4. The session opens by itself at its opening time (press **Start** to open it early). The screen shows a QR code that rotates every second, a live count of marked students, and the marks made by each tab (node).
5. It closes by itself at its closing time; press **Stop** to close it early, or **Start again** to reopen it until the closing time.
6. Results: a table on screen plus CSV export. The lecturer can mark or unmark a student by hand (dead phone, broken camera) and reset a student's face.
7. Approvals queue: flagged duplicate faces (twins) and edited registration details.

The load splash (the logo built by sliding lines, then flying into place) plays once per device; later visits skip it (`localStorage` key `aiq-splash-seen`), and sign-in focuses the email field only after it ends.

Lecturer navigation: the sidebar holds **Dashboard** (live sessions, schedule, courses and last turnout; on phones the course list is left to the Courses page), **Courses** (one card per course, opening its attendance table and roster), **History** (closed sessions). Courses and History both have a filter bar of course, week and level dropdowns, kept in the URL; level comes from the first digit of the course code (`CSC 301` is Level 300), and a dropdown with no options is hidden and, at the bottom, **Sign out**. It has two widths: icons only, or full with labels; the logo at its top switches between them. On desktop it sits beside the page, and clicking any empty part of the icon rail also opens it fully. Below 1024px the page fills the screen and the sidebar is hidden behind a black tab in the top-right corner: tap it for the icon rail, then swipe right (or tap the logo) to open it fully. Swipe left, tap outside, press Esc or pick a page to close it. **New session** (the + in the top bar, which turns into an x that closes it) is one form: type and course as cards, then week, date and times (prefilled: the week after the course's last held attendance session, today, opening now and closing 20 minutes later); a preview card beside it on desktop shows how the session will look. A **session page** puts the rotating QR on a black stage (Start, Copy student link, Project full screen, which shows only the QR and its timer; the two buttons stay on one row, shortening to Copy link / Full screen on narrow screens), with Stop on the title row, beside a panel with the marked/registered count as a ring and every phone that marked someone, flagging phones with many marks. While the sidebar is hidden (below 1024px), the session page's top bar shows its count and a **Results** button in place of +, the bell and the name. The top bar has a search field on the dashboard (courses by code or name, students by name, index or student number), **+** for a new session, a bell that lists waiting approvals and opens the queue, and the lecturer's avatar and name.

## Student registration (link in Registration mode)

1. The student starts typing their name. After 3 letters, up to 5 roster names are suggested. Suggestions show **names only**.
2. Picking a name fills the email, student number and index number **masked** (`k****@st.uni.edu`, `****4821`). The student can keep them or retype any field in full.
3. A retyped field that differs from the roster is an **edit**. It is approved automatically or goes to the lecturer, depending on the session setting.
4. If the name isn't on the roster, the student types every field in full and still submits (this also counts as an edit).
5. A roster entry that has already registered stops appearing in suggestions. Only the lecturer can release it.
6. Face capture with a liveness challenge (below).
7. **Duplicate check:** the new face is compared against every registered face in the course. A close match is not rejected. It goes to the lecturer as "possible duplicate of X". The lecturer checks both students in person and picks a photo of them together as evidence (e.g. twins) before approving. The photo stays on the lecturer's device and is never uploaded.
8. A bad face scan can only be redone after the lecturer resets it.

Fields: full name, student email, student number, index number (student number and index number are different things).

## Student attendance (link in Attendance mode)

1. Open the link on a phone and scan the QR code from the lecturer's screen, or from any node.
2. Face + liveness check, matched against every registered face in the course: no index number. The best match is taken only if it scores at least `MATCH_1N` and beats the runner-up by `MARGIN` (`lib/face.ts`).
3. If the server can't tell who it is, the phone asks for the index number and sends the same capture again (no new filming, and it doesn't use up a try). The typed student must match (`MATCH`) and be about the best match (within `MARGIN` of it), so nobody marks a lookalike classmate by typing their number.
4. Marked present, showing the index number the face was matched to. Marking twice shows "already marked"; the search covers students already marked, so marking yourself again can't land on a lookalike.
5. This tab is now a **node**. It can show its own rotating QR code so friends can scan it. It can also verify another person on the same phone, one after another, with no limit.
6. Refreshing or closing the tab ends the node. The QR codes are gone.

Chain depth is unlimited. The rotating code is what protects it.

## QR codes

- A new code every second. Each code is signed by the server and carries the server's time.
- **Scanning and submitting are separate.** On scan, the phone sends the code to the server straight away. The server checks that the code was issued ≤3 s ago by its own clock and returns a **scan ticket** (one use, valid ~2 min). The face check then runs at its own pace, and the submit carries the ticket. The phone's clock is never trusted.
- Each screen makes its own codes, once a second, with a **QR key** for its node (an HMAC of session + node under the app secret). No screen ever holds the app secret, and showing codes costs no request. A node's key can only make codes for that node, so a key passed to an absent friend gives them what a copied node token already did (see the threat table): marks that show under that node. Codes carry the server's time: a node takes its clock offset from its mark's timestamp, the lecturer's screen from the live poll.
- A tab becomes a node by marking someone; the server then gives it a **node token** (signed session + node id). Along with it comes the node's QR key. The token keeps every person it marks under the same phone in the lecturer's list. Each of those people still scans a live code first.
- Making and checking codes is stateless, so it costs no storage. Scan tickets are sealed (signed JSON), so issuing one stores nothing; redeeming one counts its tries in Redis.

## Face + liveness

All on the server (Modal). The phone only captures frames.

1. The ticket carries a random challenge (`lib/challenge.ts`, picked with Web Crypto): 8 screen colours and an oval at a random spot and size.
2. The student starts at arm's length in a small oval with the screen white (a ring light in a dim room), then the screen shows the colours, 400 ms each (2.5 changes a second, under WCAG's 3-flashes limit, with soft transitions), while they bring the phone closer until their face fills the challenge's oval. About 4 seconds in all. No turning.
3. The phone uploads 4 frames (300×400, ~20–30 KB each: the 3:4 area the preview shows; 2 far, 2 close in the last colour, white) plus a small snapshot every 100 ms (~42 × 4–7 KB), each with its time from the flash start, and the scan ticket. These endpoints' body limit is ~1.2 MB; every other endpoint uses the default 32 KB.
4. The server checks that:
   - the face never leaves the snapshots and never jumps between them (photos swapped in front of the camera do both), and each frame is the picture its snapshot was taken from,
   - the face grew and ended up in the challenge's oval (a pre-recorded clip doesn't line up),
   - coming closer changed the face's proportions the way a real head does (the nose is nearer the lens than the cheeks); a photo or a screen only gets bigger,
   - the face's colour followed the screen's sequence, measured against the background so the camera's auto white balance cancels out (a replayed video or a virtual camera never saw those colours),
   - every frame shows the same face, and an anti-spoof model doesn't flag a print or a screen,
   - the face matches a registered embedding (see attendance above).
5. YuNet also runs on the phone (onnxruntime-web, the runtime from jsDelivr, ~3.8 MB compressed, cached after the first time) for hints only: "move closer", "centre your face", "too dark". It holds the Start button until the face sits in the oval. Nothing it says is trusted; until it loads, or where it can't run, the check works without hints.
4. Frames are processed in memory and dropped. **Only embeddings are stored. No photos.** (The duplicate-evidence photo stays on the lecturer's device.) Failed checks log numbers only, for tuning.

Matching speed: comparing one embedding against a course's embeddings is a plain loop. 1000 students × 128 floats takes about 1 ms. Embeddings are read fresh from Turso for each registration (a shared cache would cost as much to keep in sync, and a stale one would miss someone registering twice). Turso's vector search is the upgrade path if a single deployment ever passes ~50k students.

## Known limits (accepted for v1)

| Attack | Status |
|---|---|
| Photo of the QR sent to someone at home | Blocked (1 s rotation, 3 s server window) |
| A printed photo or a phone screen held to the camera | Blocked (depth + colour flash + anti-spoof) |
| A pre-recorded video of the student, held up or through a virtual camera | Blocked (colour flash: the video never saw the colours; the oval's spot is random) |
| Faking a "matched" result or replaying an embedding | Blocked (server-side verification) |
| One person registering as two people | Blocked (duplicate check + lecturer approval) |
| Live video call relaying the QR code | **Not blocked.** Lecturer sees marks per node. |
| Real-time deepfake through a virtual camera | **Not blocked.** It would have to relight the face with the screen's colours as they change; the phone-only gate makes it harder; the browser type can be faked. |
| Twins marking for each other after approval | **Not blocked.** |
| A node token or QR key copied to an absent friend's phone | **Not blocked.** Their marks show under that node, which the lecturer sees flagged once it marks many people. |

Backstops: the live count vs. people in the room, the marks made by each node, and manual unmark.

Other limits: models can be less accurate in poor lighting and on some skin tones, so manual marking is the fallback. iOS Safari needs HTTPS for camera access.

## Known costs

Free-tier allowances: Turso 500M rows read and 10M written a month (queries fail with `BLOCKED` past it); Upstash 500K commands a month. Turso bills every row a query *scans*, `count(*)` included.

- **Turso, per mark:** about 3 rows read. **Live view:** 2 rows per poll, plus about two rows per mark in the session whenever the count moved. **Lecturer pages:** one row per session and course, plus the course page's attendance table (one row per mark in that course). **Registration:** one row per registered student for the duplicate check, one per roster student per name search.
- **Upstash, per mark:** about 4 commands (try counter 2, face log ~1, spending the ticket 1); per registration about 8. A 200-student class is roughly 800 commands. Nothing in the app polls Redis; load tests are what spend it fast.

- **Vercel Hobby:** showing QR codes costs nothing on the server (each screen makes its own). Per student: one page load, a ticket, a face check. The lecturer's live view adds one short request every 3 s while visible.
- **Modal Starter:** $30/month free credits. A face check is about 0.2 CPU-seconds. Modal bills containers while they're up, idle included: one spare container is kept while checks run, and idle ones shut down after 2 minutes. Pressing Start wakes one ahead of the rush.

## Data model

See [`db/schema.sql`](../db/schema.sql).

- `courses(id, code, name, students, registered)`. `students` and `registered` are counters kept by triggers.
- `students(id, course_id, name, email, student_no, index_no, embedding, status, on_roster)`. Roster and registrations share one table: an imported roster row has no embedding until the student registers. `status` is `active | pending_duplicate | pending_edit`; `on_roster = 0` for students who weren't listed and typed their own details. Unique on `(course_id, index_no)`.
- `sessions(id, course_id, week, kind, date, starts, ends, opens_at, closes_at, auto_approve_edits, started_at, stopped_at, present)`. `present` is a trigger-kept count of its attendance rows. Status is computed, the same for both kinds: live from `opens_at` (or Start, if earlier) until Stop or `closes_at`. A session counts as held once it has opened; one stopped before `opens_at` was cancelled.
- `attendance(session_id, student_id, marked_at, node_id, from_node, method)`, unique on `(session_id, student_id)`, method is `face | manual`.
- `approvals(id, kind, student_id, payload, created_at)` where kind is `duplicate_face | edit`. Rows are deleted once decided.

Redis holds scan tickets (2 minutes, 3 face tries each), rate-limit counters and the face-check log (numbers only).

## Not building

- Student accounts or logins, linking devices to students
- Multiple lecturers per deployment
- Location or geofence checks
- Late or partial attendance states (present/absent only)
- Offline mode
- Storing face photos
- Tablet or desktop support for students
