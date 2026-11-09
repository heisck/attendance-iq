// npm test. Node runs the .ts imports directly (type stripping).
import { createClient } from "@libsql/client";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { COLORS, pickChallenge } from "./challenge.ts";
import { csvCell, parseCsv } from "./csv.ts";
import { makeCode } from "./code.ts";
import { lecturerCookie, isLecturerCookie, nodeToken, qrKey, readCode, readNodeToken, seal, unseal } from "./sign.ts";
import { openedAt, sessionStatus, zoned } from "./time.ts";

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
  assert.equal(sessionStatus(base, 500), "scheduled");
  assert.equal(sessionStatus(base, 5000), "live", "opens by itself at opensAt");
  assert.equal(sessionStatus({ ...base, startedAt: 200 }, 500), "live", "Start opens it early");
  assert.equal(sessionStatus({ ...base, startedAt: 5000 }, 5000 + 31 * 60_000), "live", "no 30-minute cap: the window rules");
  assert.equal(sessionStatus(base, 10_000_000), "closed");
  assert.equal(sessionStatus({ ...base, stoppedAt: 2000 }, 5000), "closed");
  // Held or not.
  assert.equal(openedAt(base, 500), null, "still ahead");
  assert.equal(openedAt(base, 5000), 1000, "opened by itself");
  assert.equal(openedAt({ ...base, startedAt: 200 }, 500), 200, "Start");
  assert.equal(openedAt({ ...base, stoppedAt: 800 }, 5000), null, "stopped before it opened = cancelled");
  assert.equal(openedAt({ ...base, stoppedAt: 3000 }, 5000), 1000, "stopped after it opened = held");
});

test("qr codes, node tokens, sealed values, cookie", async () => {
  const now = 1_700_000_000_500;
  // Made in the browser's Web Crypto with the node's key, checked by the server's node:crypto.
  const code = await makeCode(qrKey("s1", "AB12CD"), "s1", "AB12CD", now);
  assert.equal(readCode(code, "s1", now + 3400), "AB12CD");
  assert.equal(readCode(code, "s1", now + 4000), null, "older than 3 s");
  assert.equal(readCode(code, "s2", now), null, "other session");
  assert.equal(readCode(code.replace("AB12CD", "AB12CE"), "s1", now), null, "tampered node");
  assert.equal(readCode(await makeCode(qrKey("s1", "OTHER1"), "s1", "AB12CD", now), "s1", now), null, "another node's key");
  assert.equal(readCode(await makeCode(qrKey("s1", "lecturer"), "s1", "lecturer", now), "s1", now + 1000), "lecturer");
  const ticket = seal("ticket", { id: "t1", n: 1 });
  assert.deepEqual(unseal("ticket", ticket), { id: "t1", n: 1 });
  assert.equal(unseal("other", ticket), null, "sealed for another purpose");
  const [body, sig] = ticket.split(".");
  assert.equal(unseal("ticket", `${Buffer.from('{"id":"t1","n":9}').toString("base64url")}.${sig}`), null, "tampered body");
  assert.ok(body);
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

test("face challenge", () => {
  const seen = new Set();
  const counts = {};
  const firsts = new Set();
  for (let i = 0; i < 2000; i++) {
    const { colors, oval } = pickChallenge();
    seen.add(colors.join());
    assert.equal(colors.length, 8);
    assert.ok(colors.every((c) => Number.isInteger(c) && c >= 0 && c < COLORS.length));
    assert.ok(colors.every((c, j) => j === 0 || c !== colors[j - 1]), "no colour twice in a row");
    assert.equal(colors.at(-1), 0, "ends on white");
    assert.ok(new Set(colors.filter(Boolean)).size >= 3, "at least 3 real colours");
    assert.ok(oval.x >= 0.4 && oval.x <= 0.6 && oval.y >= 0.42 && oval.y <= 0.52 && oval.w >= 0.66 && oval.w <= 0.76);
    const { smiles } = pickChallenge();
    assert.ok(smiles.length === 1 || smiles.length === 2);
    assert.ok(smiles.every((s) => s % 100 === 0), "on the 100 ms grid");
    assert.ok(smiles[0] >= -400 && smiles[0] <= 3600);
    if (smiles[1]) assert.ok(smiles[1] - smiles[0] >= 2000 + 1200 && smiles[1] - smiles[0] <= 2000 + 2400);
    counts[smiles.length] = (counts[smiles.length] ?? 0) + 1;
    firsts.add(smiles[0]);
  }
  assert.ok(seen.size > 1900, "sequences don't repeat");
  assert.ok(counts[1] > 800 && counts[2] > 800, "one or two smiles, about evenly");
  assert.equal(firsts.size, 41, "every first-smile moment comes up, from the far hold to past the colours");
});
