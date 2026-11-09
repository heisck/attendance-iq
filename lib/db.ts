import { createClient, type Row } from "@libsql/client";
import { FIELDS, type Field } from "./schemas";
import { sessionStatus, type SessionKind, type SessionStatus } from "./time";

// Turso in production (libsql://... + token); a local file in dev (TURSO_DATABASE_URL=file:local.db).
// The client queues past `concurrency` requests in flight (default 20); one instance can serve a whole
// class at once, and each request is a short HTTP call, so allow more.
export const db = createClient({ url: process.env.TURSO_DATABASE_URL ?? "file:local.db", authToken: process.env.TURSO_AUTH_TOKEN, concurrency: 200 });

export const newId = (len = 10) => crypto.randomUUID().replaceAll("-", "").slice(0, len);

export type Course = { id: string; code: string; name: string; students: number; registered: number };
export type Student = {
  id: string;
  courseId: string;
  name: string;
  email: string;
  studentNo: string;
  indexNo: string;
  registered: boolean;
  status: "active" | "pending_duplicate" | "pending_edit";
};
export type Session = {
  id: string;
  courseId: string;
  code: string;
  courseName: string;
  week: number;
  kind: SessionKind;
  date: string;
  start: string;
  end: string;
  opensAt: number;
  closesAt: number;
  startedAt: number | null;
  stoppedAt: number | null;
  autoApproveEdits: boolean;
  status: SessionStatus;
  // Present (attendance) or registered (registration), out of the course roster.
  done: number;
  total: number;
};
// A student tab that became a node. `from` is whose QR it scanned ("lecturer" = the lecturer's screen).
export type Node = { id: string; from: string; marked: number };
// unlisted: the student wasn't on the roster and typed every detail themselves.
export type Approval = { id: string; courseId: string; courseCode: string; student: string; indexNo: string; unlisted: boolean; submittedAt: string } & (
  | { kind: "duplicate_face"; matches: string; matchesIndexNo: string; similarity: number }
  | { kind: "edit"; changes: { field: string; from: string; to: string }[] }
);

const num = (v: unknown) => (v == null ? null : Number(v));

function toSession(r: Row): Session {
  const s = {
    id: r.id as string,
    courseId: r.course_id as string,
    code: r.code as string,
    courseName: r.course_name as string,
    week: Number(r.week),
    kind: r.kind as SessionKind,
    date: r.date as string,
    start: r.starts as string,
    end: r.ends as string,
    opensAt: Number(r.opens_at),
    closesAt: Number(r.closes_at),
    startedAt: num(r.started_at),
    stoppedAt: num(r.stopped_at),
    autoApproveEdits: !!r.auto_approve_edits,
    done: Number(r.kind === "registration" ? r.registered ?? 0 : r.present ?? 0),
    total: Number(r.total ?? 0),
  };
  return { ...s, status: sessionStatus(s) };
}

// Counts come from counter columns kept by triggers (db/schema.sql), so this reads one row per session
// and course instead of counting every student and every mark ever taken.
const SESSIONS = `
  SELECT se.*, c.code, c.name AS course_name, c.students AS total, c.registered
  FROM sessions se JOIN courses c ON c.id = se.course_id`;

// Lecturer pages: every session with its counts.
export async function listSessions() {
  return (await db.execute(SESSIONS)).rows.map(toSession);
}

// Student routes hit this on every request, a class at a time, so each server instance keeps rows
// for a few seconds. Status is recomputed on every read.
// ponytail: Stop reaches other instances up to SESSION_TTL_MS late; push invalidation via Redis if that matters.
const SESSION_TTL_MS = 5_000;
const sessionCache = new Map<string, { at: number; row: Row | undefined }>();

// Lecturer pages pass fresh: their own Start and Stop must show at once.
export async function getSession(id: string, fresh = false) {
  let hit = sessionCache.get(id);
  if (fresh || !hit || Date.now() - hit.at > SESSION_TTL_MS) {
    const res = await db.execute({ sql: `${SESSIONS} WHERE se.id = ?`, args: [id] });
    hit = { at: Date.now(), row: res.rows[0] };
    if (sessionCache.size > 500) sessionCache.clear();
    sessionCache.set(id, hit);
  }
  return hit.row ? toSession(hit.row) : null;
}

export async function listCourses(): Promise<Course[]> {
  const res = await db.execute("SELECT id, code, name, students, registered FROM courses ORDER BY code");
  return res.rows.map((r) => ({ id: r.id as string, code: r.code as string, name: r.name as string, students: Number(r.students), registered: Number(r.registered) }));
}

const STUDENT_COLS = "id, course_id, name, email, student_no, index_no, embedding IS NOT NULL AS registered, status";
const toStudent = (r: Row): Student => ({
  id: r.id as string,
  courseId: r.course_id as string,
  name: r.name as string,
  email: r.email as string,
  studentNo: r.student_no as string,
  indexNo: r.index_no as string,
  registered: !!r.registered,
  status: r.status as Student["status"],
});

export async function listStudents(courseId: string) {
  const res = await db.execute({ sql: `SELECT ${STUDENT_COLS} FROM students WHERE course_id = ? ORDER BY name`, args: [courseId] });
  return res.rows.map(toStudent);
}

// "<session id>:<student id>" for every mark in the course.
export async function courseMarks(courseId: string) {
  const res = await db.execute({
    sql: "SELECT a.session_id, a.student_id FROM attendance a JOIN sessions se ON se.id = a.session_id WHERE se.course_id = ?",
    args: [courseId],
  });
  return res.rows.map((r) => `${r.session_id}:${r.student_id}`);
}

// Reads every mark in the session, so the live poll only calls it when the count has moved.
export async function liveNodes(sessionId: string): Promise<Node[]> {
  const res = await db.execute({
    sql: "SELECT node_id, min(from_node) AS from_node, count(*) AS marked FROM attendance WHERE session_id = ? AND node_id IS NOT NULL GROUP BY node_id",
    args: [sessionId],
  });
  return res.rows.map((r) => ({ id: r.node_id as string, from: r.from_node as string, marked: Number(r.marked) }));
}

const TZ = process.env.APP_TIMEZONE || "UTC";
const LABEL = FIELDS as Record<string, string>;

export async function listApprovals(): Promise<Approval[]> {
  const res = await db.execute(`
    SELECT ap.id, ap.kind, ap.payload, ap.created_at, s.name, s.index_no, s.course_id, s.on_roster, c.code, m.name AS match_name, m.index_no AS match_index
    FROM approvals ap
    JOIN students s ON s.id = ap.student_id
    JOIN courses c ON c.id = s.course_id
    LEFT JOIN students m ON m.id = json_extract(ap.payload, '$.matchId')
    ORDER BY ap.created_at`);
  return res.rows.map((r) => {
    const payload = JSON.parse(r.payload as string);
    const base = {
      id: r.id as string,
      courseId: r.course_id as string,
      courseCode: r.code as string,
      student: r.name as string,
      indexNo: r.index_no as string,
      unlisted: !r.on_roster,
      submittedAt: new Date(Number(r.created_at)).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16),
    };
    return r.kind === "duplicate_face"
      ? { ...base, kind: "duplicate_face", matches: (r.match_name as string) ?? "A removed student", matchesIndexNo: (r.match_index as string) ?? "", similarity: payload.similarity }
      : { ...base, kind: "edit", changes: payload.changes.map((c: { key: Field; from: string; to: string }) => ({ field: LABEL[c.key], from: c.from, to: c.to })) };
  });
}

// Top-bar search: every course and student, fetched once when the field is first focused.
export async function searchIndex() {
  const [courses, students] = await db.batch(["SELECT id, code, name FROM courses", "SELECT id, course_id, name, index_no, student_no FROM students"], "read");
  return {
    courses: courses.rows.map((r) => ({ id: r.id as string, code: r.code as string, name: r.name as string })),
    students: students.rows.map((r) => ({ id: r.id as string, courseId: r.course_id as string, name: r.name as string, indexNo: r.index_no as string, studentNo: r.student_no as string })),
  };
}
