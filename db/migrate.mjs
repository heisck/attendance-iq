// npm run db:migrate: applies db/schema.sql to TURSO_DATABASE_URL (or file:local.db).
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
await db.executeMultiple(readFileSync(new URL("schema.sql", import.meta.url), "utf8"));
console.log(`Schema applied to ${url.split("?")[0]}`);
