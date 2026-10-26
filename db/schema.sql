-- Turso (libSQL). Applied by `npm run db:migrate`; every statement is safe to re-run.

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL
);

-- Roster and registrations share one table. A roster import adds rows with no embedding;
-- registering fills it in. embedding IS NULL = not registered (still offered in name suggestions).
-- on_roster = 0: the student wasn't listed and typed their own details.
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  student_no TEXT NOT NULL,
  index_no TEXT NOT NULL,
  embedding BLOB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_duplicate', 'pending_edit')),
  on_roster INTEGER NOT NULL DEFAULT 1,
  UNIQUE (course_id, index_no)
);

-- date/starts/ends are what the lecturer typed (for display); opens_at/closes_at are epoch ms (for checks).
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  week INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'attendance')),
  date TEXT NOT NULL,
  starts TEXT NOT NULL,
  ends TEXT NOT NULL,
  opens_at INTEGER NOT NULL,
  closes_at INTEGER NOT NULL,
  auto_approve_edits INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  stopped_at INTEGER
);
CREATE INDEX IF NOT EXISTS sessions_course ON sessions (course_id);

-- node_id: the phone (tab) that ran the face check. from_node: whose QR that phone scanned
-- ('lecturer' = the lecturer's screen). Both null for manual marks.
CREATE TABLE IF NOT EXISTS attendance (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  marked_at INTEGER NOT NULL,
  node_id TEXT,
  from_node TEXT,
  method TEXT NOT NULL CHECK (method IN ('face', 'manual')),
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS attendance_student ON attendance (student_id);

-- Waiting decisions only: a row is deleted once the lecturer decides.
-- payload: duplicate_face {matchId, similarity} | edit {changes: [{key, from, to}]}
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('duplicate_face', 'edit')),
  student_id TEXT NOT NULL REFERENCES students(id),
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS approvals_student ON approvals (student_id);
