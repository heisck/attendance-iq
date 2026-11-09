import { Redis } from "@upstash/redis";

// Upstash holds short-lived state only: scan tickets, rate-limit counters and the face-check log.
// Losing it logs nobody out and loses no attendance. Every command counts against the plan's
// monthly allowance, so nothing here polls or runs on a timer.
// Values come back as stored strings: automatic JSON parsing would turn ids like "0E1234" into numbers.
let client: Redis | undefined;
export const redis = () => (client ??= Redis.fromEnv({ automaticDeserialization: false }));

// Fixed window: false once `key` has been hit more than `max` times in `windowS` seconds.
export async function allow(key: string, max: number, windowS: number) {
  const k = `rl:${key}`;
  const [n] = await redis().pipeline().incr(k).expire(k, windowS, "NX").exec<[number, number]>();
  return n <= max;
}

// Uses up the rest of `key`'s allowance until its window ends (the key exists once allow() has run).
export const spend = (key: string, max: number) => redis().incrby(`rl:${key}`, max);
