"use server";

import type { InStatement } from "@libsql/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { parseCsv } from "./csv";
import { db, getSession, newId } from "./db";
import { cacheEmbedding, warmFace } from "./face";
import { sessionSchema, studentFields, type Field } from "./schemas";
import { isLecturer } from "./ticket";
import { zoned } from "./time";

// Lecturer mutations. Server actions are public POST endpoints, so each one checks the cookie itself.

async function lecturer() {
  if (!(await isLecturer())) throw new Error("Sign in first");
}

const refresh = () => revalidatePath("/lecturer", "layout");
const id = (v: unknown) => (typeof v === "string" && /^\w{1,40}$/.test(v) ? v : "");

export async function createSession(input: unknown): Promise<{ id: string } | { error: string }> {
  await lecturer();
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;
  const courseId = s.courseId ?? newId();
  const sessionId = newId();
  const statements: InStatement[] = [];
  if (s.newCourse) statements.push({ sql: "INSERT INTO courses (id, code, name) VALUES (?, ?, ?)", args: [courseId, s.newCourse.code, s.newCourse.name] });
  statements.push({
    sql: `INSERT INTO sessions (id, course_id, week, kind, date, starts, ends, opens_at, closes_at, auto_approve_edits)
      SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ? FROM courses WHERE id = ?`,
    args: [sessionId, s.week, s.kind, s.date, s.start, s.end, zoned(s.date, s.start), zoned(s.date, s.end), s.kind === "registration" && s.autoApprove ? 1 : 0, courseId],
  });
  const results = await db.batch(statements, "write");
  if (!results.at(-1)!.rowsAffected) return { error: "That course no longer exists." };
  refresh();
  return { id: sessionId };
}

// Start (again, if stopped): opens attendance for 30 minutes and wakes the face service.
// Past its closing time it changes nothing: a session that never opened mustn't count as held.
export async function startSession(sessionId: string) {
  await lecturer();
  const now = Date.now();
  await db.execute({ sql: "UPDATE sessions SET started_at = ?, stopped_at = NULL WHERE id = ? AND closes_at > ?", args: [now, id(sessionId), now] });
  after(warmFace);
  refresh();
  return getSession(id(sessionId), true);
}

export async function stopSession(sessionId: string) {
  await lecturer();
  await db.execute({ sql: "UPDATE sessions SET stopped_at = ? WHERE id = ?", args: [Date.now(), id(sessionId)] });
  refresh();
  return getSession(id(sessionId), true);
}

// Marking by hand (dead phone, broken camera) or unmarking.
export async function setMark(sessionId: string, studentId: string, present: boolean) {
  await lecturer();
  await db.execute(
    present
      ? {
          sql: "INSERT OR IGNORE INTO attendance (session_id, student_id, marked_at, method) SELECT se.id, st.id, ?, 'manual' FROM sessions se JOIN students st ON st.course_id = se.course_id WHERE se.id = ? AND st.id = ?",
          args: [Date.now(), id(sessionId), id(studentId)],
        }
      : { sql: "DELETE FROM attendance WHERE session_id = ? AND student_id = ?", args: [id(sessionId), id(studentId)] },
  );
  refresh();
}

// Clears a face so the student can register again (their roster entry shows in suggestions again).
export async function resetFace(studentId: string) {
  await lecturer();
  const sid = id(studentId);
  const [student] = await db.batch(
    [
      { sql: "SELECT course_id FROM students WHERE id = ?", args: [sid] },
      { sql: "UPDATE students SET embedding = NULL, status = 'active' WHERE id = ?", args: [sid] },
      { sql: "DELETE FROM approvals WHERE student_id = ?", args: [sid] },
    ],
    "write",
  );
  if (student.rows[0]) await cacheEmbedding(student.rows[0].course_id as string, sid, null);
  refresh();
}

const MAX_ROSTER_ROWS = 5000;

// CSV columns: name, email, student number, index number. A header row is optional.
// Rows match on index number: new ones are added, existing ones get the CSV's details.
export async function importRoster(courseId: string, csv: string): Promise<{ added: number; skipped: string[] } | { error: string }> {
  await lecturer();
  if (csv.length > 800_000) return { error: "That file is too large. Split it into smaller files." };
  const rows = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
  if (rows[0]?.[0]?.trim().toLowerCase() === "name") rows.shift();
  if (rows.length > MAX_ROSTER_ROWS) return { error: `Import up to ${MAX_ROSTER_ROWS} students at a time.` };

  const skipped: string[] = [];
  const statements: InStatement[] = [];
  rows.forEach(([name, email, studentNo, indexNo], i) => {
    const r = studentFields.safeParse({ name, email, studentNo, indexNo });
    if (!r.success) return skipped.push(`Row ${i + 1}: ${r.error.issues[0].message}`);
    statements.push({
      sql: `INSERT INTO students (id, course_id, name, email, student_no, index_no) SELECT ?, id, ?, ?, ?, ? FROM courses WHERE id = ?
        ON CONFLICT (course_id, index_no) DO UPDATE SET name = excluded.name, email = excluded.email, student_no = excluded.student_no`,
      args: [newId(), r.data.name, r.data.email, r.data.studentNo, r.data.indexNo, id(courseId)],
    });
  });
  if (statements.length) await db.batch(statements, "write");
  refresh();
  return { added: statements.length, skipped };
}

const COLUMN: Record<Field, string> = { name: "name", email: "email", studentNo: "student_no", indexNo: "index_no" };
// A student's status once an approval is gone: whatever is still waiting, else active.
const restatus = (studentId: string): InStatement => ({
  sql: `UPDATE students SET status = CASE
      WHEN EXISTS (SELECT 1 FROM approvals WHERE student_id = ?1 AND kind = 'duplicate_face') THEN 'pending_duplicate'
      WHEN EXISTS (SELECT 1 FROM approvals WHERE student_id = ?1 AND kind = 'edit') THEN 'pending_edit'
      ELSE 'active' END
    WHERE id = ?1`,
  args: [studentId],
});

// Approve: duplicate -> confirmed as a different person; edit -> details applied.
// Reject: duplicate -> registration voided; edit -> roster details kept (or, for a student not on the
// roster, registration voided). The evidence photo is checked in the room and never uploaded.
export async function decideApproval(approvalId: string, approve: boolean): Promise<{ error: string } | void> {
  await lecturer();
  const ap = (
    await db.execute({
      sql: "SELECT ap.id, ap.kind, ap.payload, ap.student_id, s.course_id, s.on_roster FROM approvals ap JOIN students s ON s.id = ap.student_id WHERE ap.id = ?",
      args: [id(approvalId)],
    })
  ).rows[0];
  if (!ap) return refresh();
  const sid = ap.student_id as string;
  const drop = { sql: "DELETE FROM approvals WHERE id = ?", args: [ap.id] };
  const changes: { key: Field; to: string }[] = ap.kind === "edit" ? JSON.parse(ap.payload as string).changes : [];

  let statements: InStatement[];
  if (approve) {
    statements = [...changes.map((c) => ({ sql: `UPDATE students SET ${COLUMN[c.key]} = ? WHERE id = ?`, args: [c.to, sid] })), drop, restatus(sid)];
  } else if (ap.kind === "edit" && ap.on_roster) {
    statements = [drop, restatus(sid)];
  } else {
    // Void the registration: a roster entry goes back to unregistered; a self-added student is removed.
    statements = [
      { sql: "DELETE FROM approvals WHERE student_id = ?", args: [sid] },
      ap.on_roster
        ? { sql: "UPDATE students SET embedding = NULL, status = 'active' WHERE id = ?", args: [sid] }
        : { sql: "DELETE FROM students WHERE id = ?", args: [sid] },
    ];
  }
  try {
    await db.batch(statements, "write");
  } catch (e) {
    if (String(e).includes("UNIQUE")) return { error: "That index number already belongs to another student. Fix the roster first." };
    throw e;
  }
  if (!approve && !(ap.kind === "edit" && ap.on_roster)) await cacheEmbedding(ap.course_id as string, sid, null);
  refresh();
}
