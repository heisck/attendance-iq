// npm test. Node runs the .ts imports directly (type stripping).
import assert from "node:assert/strict";
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
