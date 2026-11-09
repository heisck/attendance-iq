-- Turso (libSQL). Applied by `npm run db:migrate`; every statement is safe to re-run.

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  students INTEGER NOT NULL DEFAULT 0,
  registered INTEGER NOT NULL DEFAULT 0
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
-- Registration name search reads only students not yet registered, in name order, so it stops at the
-- first few matches (measured: 600-student course, 600+ rows per search before, 5-91 after).
CREATE INDEX IF NOT EXISTS students_unregistered ON students (course_id, name) WHERE embedding IS NULL;

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
  stopped_at INTEGER,
  present INTEGER NOT NULL DEFAULT 0
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

-- Counters, so lecturer pages and the live poll read one row instead of counting thousands
-- (Turso bills every row a count scans). Triggers keep them exact whichever path writes;
-- the UPDATEs below recount from scratch, so each migrate also repairs any drift.
-- courses.students / registered: roster size and faces enrolled. sessions.present: marks.
CREATE TRIGGER IF NOT EXISTS students_added AFTER INSERT ON students BEGIN
  UPDATE courses SET students = students + 1, registered = registered + (NEW.embedding IS NOT NULL) WHERE id = NEW.course_id;
END;
CREATE TRIGGER IF NOT EXISTS students_removed AFTER DELETE ON students BEGIN
  UPDATE courses SET students = students - 1, registered = registered - (OLD.embedding IS NOT NULL) WHERE id = OLD.course_id;
END;
CREATE TRIGGER IF NOT EXISTS students_face AFTER UPDATE OF embedding ON students
WHEN (OLD.embedding IS NULL) <> (NEW.embedding IS NULL) BEGIN
  UPDATE courses SET registered = registered + (NEW.embedding IS NOT NULL) - (OLD.embedding IS NOT NULL) WHERE id = NEW.course_id;
END;
CREATE TRIGGER IF NOT EXISTS attendance_added AFTER INSERT ON attendance BEGIN
  UPDATE sessions SET present = present + 1 WHERE id = NEW.session_id;
END;
CREATE TRIGGER IF NOT EXISTS attendance_removed AFTER DELETE ON attendance BEGIN
  UPDATE sessions SET present = present - 1 WHERE id = OLD.session_id;
END;
UPDATE courses SET
  students = (SELECT count(*) FROM students s WHERE s.course_id = courses.id),
  registered = (SELECT count(embedding) FROM students s WHERE s.course_id = courses.id);
UPDATE sessions SET present = (SELECT count(*) FROM attendance a WHERE a.session_id = sessions.id);
