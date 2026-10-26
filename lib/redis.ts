import { Redis } from "@upstash/redis";

// Upstash holds short-lived state only: scan tickets, rate-limit counters and each course's
// embedding cache. Losing it logs nobody out and loses no attendance.
// Values come back as stored strings: automatic JSON parsing would turn ids like "0E1234" into numbers.
let client: Redis | undefined;
export const redis = () => (client ??= Redis.fromEnv({ automaticDeserialization: false }));

// Fixed window: false once `key` has been hit more than `max` times in `windowS` seconds.
export async function allow(key: string, max: number, windowS: number) {
  const k = `rl:${key}`;
  const [n] = await redis().pipeline().incr(k).expire(k, windowS, "NX").exec<[number, number]>();
  return n <= max;
}

// HGETALL as an object of strings; null when the key doesn't exist.
// (Without automatic deserialization the client returns a flat [field, value, ...] list.)
export async function hash(key: string) {
  const flat = (await redis().hgetall(key)) as unknown as string[] | null;
  if (!flat?.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}
