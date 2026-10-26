# Attendance IQ: Product Spec

A self-hosted attendance system. Lecturers deploy their own copy. Students have no accounts: they register once per course with their face, then mark attendance by scanning a rotating QR code and passing a face + liveness check.

Status: **UI phase.** Screens run on mock data from [`/mocks`](../mocks). No database, no face model yet.

## Stack

| Part | Where |
|---|---|
| Web app (lecturer + student pages, API) | Next.js on Vercel |
| Database | Turso (libSQL) |
| Cache, rate limits, live session state | Upstash Redis |
| Face liveness, face embedding | Modal (Python, CPU). Only the heavy compute lives here. |

Modal is stateless: frames in, `{ live, sameFace, embedding }` out. Vercel does the comparison against stored embeddings and writes to Turso.

If Vercel free limits are hit (see "Known costs" below), the live QR push moves to Modal too.

## Who uses it

- **Lecturer.** One deployment = one lecturer. Pages are gated by an email and password set in env (`LECTURER_EMAIL`, `LECTURER_PASSWORD`). Works on any device. "Forgot password?" on sign-in links to the Vercel project's env vars (`NEXT_PUBLIC_PASSWORD_RESET_URL`), so only someone with access to that Vercel account can change them.
- **Student.** No sign-up, no sign-in, no device linked to anyone. **Phones only** (Android and iPhone). Tablets, laptops, desktops and Samsung DeX are blocked by viewport size. Dev exception: `NEXT_PUBLIC_DEV_ALLOW_DESKTOP=true`.

## Lecturer flow

1. Log in with the env password.
2. Fill one form: course, week, time window, and a toggle for **Registration** or **Attendance**. For registration, also choose **auto-approve edits** or **manual approve**.
3. Generate a link and share it with students.
4. Press **Start**. The screen shows a QR code that rotates every second, a live count of marked students, and the marks made by each tab (node).
5. Press **Stop**, or the session auto-closes after 30 minutes.
6. Results: a table on screen plus CSV export. The lecturer can mark or unmark a student by hand (dead phone, broken camera) and reset a student's face.
7. Approvals queue: flagged duplicate faces (twins) and edited registration details.

Lecturer navigation: the sidebar holds **Dashboard** (live sessions, schedule, courses and last turnout; on phones the course list is left to the Courses page), **Courses** (one card per course, opening its attendance table and roster), **History** (closed sessions) and, at the bottom, **Sign out**. It has two widths: icons only, or full with labels; the logo at its top switches between them. On desktop it sits beside the page, and clicking any empty part of the icon rail also opens it fully. Below 1024px the page fills the screen and the sidebar is hidden behind a black tab in the top-right corner: tap it for the icon rail, then swipe right (or tap the logo) to open it fully. Swipe left, tap outside, press Esc or pick a page to close it. **New session** (the + in the top bar, which turns into an x that closes it) is one form: type and course as cards, then week, date and times; a preview card beside it on desktop shows how the session will look. A **session page** puts the rotating QR on a black stage (Start, Copy student link, Project full screen, which shows only the QR and its timer) beside a panel with the marked/registered count as a ring and every phone that marked someone, flagging phones with many marks. The top bar has a search field on the dashboard (courses by code or name, students by name, index or student number), **+** for a new session, a bell that lists waiting approvals and opens the queue, and the lecturer's avatar and name.

## Student registration (link in Registration mode)

1. The student starts typing their name. After 3 letters, up to 5 roster names are suggested. Suggestions show **names only**.
2. Picking a name fills the email, student number and index number **masked** (`k****@st.uni.edu`, `****4821`). The student can keep them or retype any field in full.
3. A retyped field that differs from the roster is an **edit**. It is approved automatically or goes to the lecturer, depending on the session setting.
4. If the name isn't on the roster, the student types every field in full and still submits (this also counts as an edit).
5. A roster entry that has already registered stops appearing in suggestions. Only the lecturer can release it.
6. Face capture with a liveness challenge (below).
7. **Duplicate check:** the new face is compared against every registered face in the course. A close match is not rejected. It goes to the lecturer as "possible duplicate of X". The lecturer uploads a photo as evidence (e.g. twins) and approves or rejects. The evidence photo is deleted once a decision is made.
8. A bad face scan can only be redone after the lecturer resets it.

Fields: full name, student email, student number, index number (student number and index number are different things).

## Student attendance (link in Attendance mode)

1. Open the link on a phone and scan the QR code from the lecturer's screen, or from any node.
2. Enter the index number.
3. Face + liveness check, matched 1:1 against that index number's registered face.
4. Marked present. Marking twice shows "already marked".
5. This tab is now a **node**. It can show its own rotating QR code so friends can scan it. It can also verify another person on the same phone, one after another, with no limit.
6. Refreshing or closing the tab ends the node. The QR codes are gone.

Chain depth is unlimited. The rotating code is what protects it.

## QR codes

- A new code every second. Each code is signed by the server and carries the server's time.
- **Scanning and submitting are separate.** On scan, the phone sends the code to the server straight away. The server checks that the code was issued ≤3 s ago by its own clock and returns a **scan ticket** (one use, valid ~2 min). The face check then runs at its own pace, and the submit carries the ticket. The phone's clock is never trusted.
- Nodes fetch codes from the server. They never hold the signing secret (otherwise a student could pass it to an absent friend, who could then make valid codes at home).
- Making and checking codes is stateless (an HMAC with a server secret), so it costs no Redis calls. Only redeeming a ticket touches Redis.

## Face + liveness

All on the server (Modal). The phone only captures frames.

1. The server sends a random challenge (e.g. "turn left, then blink").
2. The phone uploads 5–8 small frames (~20 KB each) with the scan ticket. This endpoint's body limit is ~300 KB; every other endpoint uses the default 32 KB.
3. The server checks that:
   - the movement matches the challenge,
   - every frame shows the same face (the person doing the challenge is the person submitting),
   - an anti-spoof model doesn't flag a print or a screen,
   - the face matches the registered embedding (1:1).
4. Frames are processed in memory and dropped. **Only embeddings are stored. No photos**, except the duplicate-evidence photo, which is deleted after the decision.

Duplicate check speed: comparing one embedding against a course's embeddings is a plain loop. 500 students × 512 floats takes under 1 ms. Each course's embeddings are cached in Upstash. Turso's vector search is the upgrade path if a single deployment ever passes ~50k students.

## Known limits (accepted for v1)

| Attack | Status |
|---|---|
| Photo of the QR sent to someone at home | Blocked (1 s rotation, 3 s server window) |
| A printed photo or a phone screen held to the camera | Blocked (challenge + anti-spoof) |
| Faking a "matched" result or replaying an embedding | Blocked (server-side verification) |
| One person registering as two people | Blocked (duplicate check + lecturer approval) |
| Live video call relaying the QR code | **Not blocked.** Lecturer sees marks per node. |
| Real-time deepfake through a virtual camera | **Not blocked.** The phone-only gate makes it harder; the browser type can be faked. |
| Twins marking for each other after approval | **Not blocked.** |

Backstops: the live count vs. people in the room, the marks made by each node, and manual unmark.

Other limits: models can be less accurate in poor lighting and on some skin tones, so manual marking is the fallback. iOS Safari needs HTTPS for camera access.

## Known costs

- **Vercel Hobby:** the 1-per-second QR push for nodes is the expensive part (200 nodes × 30 min ≈ 360k requests). If it hits the limit, the push moves to a Modal WebSocket.
- **Modal Starter:** $30/month free credits. The container wakes when the lecturer presses Start. Concurrent inputs must be set high, because each WebSocket counts as one input.

## Planned data model

- `courses(id, code, name)`
- `roster(id, course_id, name, email, student_no, index_no, claimed_by)`
- `students(id, course_id, name, email, student_no, index_no, embedding, status)` where status is `active | pending_duplicate | pending_edit`
- `sessions(id, course_id, week, kind, opens_at, closes_at, auto_approve_edits, status)` where kind is `registration | attendance`
- `attendance(session_id, student_id, marked_at, node_id, method)`, unique on `(session_id, student_id)`, method is `face | manual`
- `approvals(id, kind, student_id, payload, evidence_photo, status)` where kind is `duplicate_face | edit`

## Not building

- Student accounts or logins, linking devices to students
- Multiple lecturers per deployment
- Location or geofence checks
- Late or partial attendance states (present/absent only)
- Offline mode
- Storing face photos
- Tablet or desktop support for students
