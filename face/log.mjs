// npm run facelog [hours]: what the recent face checks (lib/face.ts logFace) failed on, and by how much.
// Per result: the count, then each score as min / 10th / median / 90th percentile / max.
import { Redis } from "@upstash/redis";

const hours = Number(process.argv[2] ?? 24 * 7);
const since = Date.now() - hours * 3_600_000;
const rows = (await Redis.fromEnv({ automaticDeserialization: false }).lrange("facelog", 0, -1))
  .map((s) => JSON.parse(s))
  .filter((r) => r.t >= since);

const groups = Object.groupBy(rows, (r) => r.result);
const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
console.log(`${rows.length} entries in the last ${hours} h`);
for (const [result, list] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${result}: ${list.length}`);
  const keys = new Set(list.flatMap(Object.keys));
  for (const k of keys) {
    if (k === "t" || k === "result" || k === "frames") continue;
    // "0.12 of 0.18" (how far a turn got of what it needs) counts as 0.12.
    const xs = list.map((r) => parseFloat(r[k])).filter(Number.isFinite).sort((a, b) => a - b);
    if (xs.length) console.log(`  ${k.padEnd(10)} ${[0, 0.1, 0.5, 0.9, 1].map((p) => pct(xs, p)).join(" / ")}`);
  }
}
