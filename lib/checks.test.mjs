// npm test. Node runs the .ts imports directly (type stripping).
import { createClient } from "@libsql/client";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { csvCell, parseCsv } from "./csv.ts";
import { lecturerCookie, isLecturerCookie, makeCode, nodeToken, readCode, readNodeToken } from "./sign.ts";
import { AUTO_CLOSE_MS, sessionStatus, zoned } from "./time.ts";

process.env.APP_SECRET = "x".repeat(32);
process.env.LECTURER_EMAIL = "a@b.c";
process.env.LECTURER_PASSWORD = "pw";

test("csv", () => {
  assert.deepEqual(parseCsv('name,email\r\n"Doe, Jane","a""b"\n\nlast'), [["name", "email"], ["Doe, Jane", 'a"b'], [""], ["last"]]);
  assert.deepEqual(parseCsv(['x', csvCell('q"\n,'), "y"].join(",")), [["x", 'q"\n,', "y"]]);
});

test("zoned time", () => {
  assert.equal(zoned("2026-11-02", "08:00", "UTC"), Date.UTC(2026, 10, 2, 8));
  assert.equal(zoned("2026-11-02", "08:00", "Africa/Lagos"), Date.UTC(2026, 10, 2, 7));
  assert.equal(zoned("2026-07-01", "08:00", "Europe/London"), Date.UTC(2026, 6, 1, 7));
});

test("session status", () => {
  const base = { opensAt: 1000, closesAt: 10_000_000, startedAt: null, stoppedAt: null };
  assert.equal(sessionStatus({ ...base, kind: "attendance" }, 5000), "scheduled");
  assert.equal(sessionStatus({ ...base, kind: "attendance", startedAt: 5000 }, 6000), "live");
  assert.equal(sessionStatus({ ...base, kind: "attendance", startedAt: 5000 }, 5000 + AUTO_CLOSE_MS), "closed");
  assert.equal(sessionStatus({ ...base, kind: "registration" }, 5000), "live");
  assert.equal(sessionStatus({ ...base, kind: "registration" }, 500), "scheduled");
  assert.equal(sessionStatus({ ...base, kind: "registration", stoppedAt: 2000 }, 5000), "closed");
});

test("qr codes, node tokens, cookie", () => {
  const now = 1_700_000_000_500;
  const code = makeCode("s1", "AB12CD", now);
  assert.equal(readCode(code, "s1", now + 3400), "AB12CD");
  assert.equal(readCode(code, "s1", now + 4000), null, "older than 3 s");
  assert.equal(readCode(code, "s2", now), null, "other session");
  assert.equal(readCode(code.replace("AB12CD", "AB12CE"), "s1", now), null, "tampered node");
  assert.equal(readNodeToken(nodeToken("s1", "AB12CD"), "s1"), "AB12CD");
  assert.equal(readNodeToken(nodeToken("s1", "AB12CD"), "s2"), null);
  const cookie = lecturerCookie(now);
  assert.ok(isLecturerCookie(cookie, now));
  process.env.LECTURER_PASSWORD = "changed";
  assert.ok(!isLecturerCookie(cookie, now), "password change signs out");
});

test("count triggers follow every write the app makes", async () => {
  const db = createClient({ url: ":memory:" });
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  await db.executeMultiple(schema);
  const face = new Uint8Array(4);
  const student = (id, idx, emb = null) => ({ sql: "INSERT INTO students (id, course_id, name, email, student_no, index_no, embedding) VALUES (?, 'c', 'n', 'e', 's', ?, ?)", args: [id, idx, emb] });
  const mark = (st) => ({ sql: "INSERT OR IGNORE INTO attendance (session_id, student_id, marked_at, method) VALUES ('w1', ?, 0, 'face')", args: [st] });
  await db.batch([
    "INSERT INTO courses (id, code, name) VALUES ('c', 'C1', 'Course')",
    "INSERT INTO sessions (id, course_id, week, kind, date, starts, ends, opens_at, closes_at) VALUES ('w1', 'c', 1, 'attendance', 'd', 's', 'e', 0, 1)",
    student("a", "1", face), student("b", "2"), student("d", "3", face),
    mark("a"), mark("a"), mark("b"), mark("d"), // the repeat is ignored, as in the attend route
    { sql: "UPDATE students SET embedding = ? WHERE id = 'b' AND embedding IS NULL", args: [face] }, // register
    { sql: "UPDATE students SET embedding = ? WHERE id = 'a'", args: [face] }, // face to face: no change
    "UPDATE students SET embedding = NULL WHERE id = 'd'", // reset face
    "INSERT INTO students (id, course_id, name, email, student_no, index_no) VALUES ('x', 'c', 'n2', 'e', 's', '1') ON CONFLICT (course_id, index_no) DO UPDATE SET name = excluded.name", // re-import
    "DELETE FROM attendance WHERE student_id = 'd'", // unmark
    "DELETE FROM students WHERE id = 'd'", // void a self-added student
  ]);
  const count = async () => (await db.execute("SELECT c.students, c.registered, se.present FROM courses c, sessions se")).rows[0];
  const real = { students: 2, registered: 2, present: 2 };
  assert.deepEqual({ ...(await count()) }, real);
  await db.executeMultiple(schema); // re-running the migration recounts to the same numbers
  assert.deepEqual({ ...(await count()) }, real);
  db.close();
});
