// npm run db:migrate: applies db/schema.sql to TURSO_DATABASE_URL (or file:local.db).
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

// Columns added after a table was first created. SQLite has no ADD COLUMN IF NOT EXISTS, so each is
// tried and "already there" (or, on a fresh database, "no table yet": schema.sql creates it whole) skipped.
const ADDED = [
  "ALTER TABLE courses ADD COLUMN students INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE courses ADD COLUMN registered INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE sessions ADD COLUMN present INTEGER NOT NULL DEFAULT 0",
];
for (const sql of ADDED) {
  await db.execute(sql).catch((e) => {
    if (!/duplicate column|no such table/i.test(String(e))) throw e;
  });
}
await db.executeMultiple(readFileSync(new URL("schema.sql", import.meta.url), "utf8"));
console.log(`Schema applied to ${url.split("?")[0]}`);
