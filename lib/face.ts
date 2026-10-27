import { db } from "./db";
import { hash, redis } from "./redis";
import type { Step } from "./schemas";

// Modal does the heavy compute (face/app.py) and returns an embedding; matching happens here.

// SFace cosine similarity at or above this = same person (OpenCV's published threshold).
export const MATCH = 0.363;

// Straight on, then both turns in random order. "up" stays supported by the face service but isn't asked:
// landmark pitch barely moves on a natural look-up (real attempts measured 0.04-0.08 of the 0.10 needed),
// while turns register several times over.
export function pickChallenge(): Step[] {
  return Math.random() < 0.5 ? ["center", "left", "right"] : ["center", "right", "left"];
}

export type FaceResult = { ok: true; embedding: Float32Array } | { ok: false; reason: "no_face" | "challenge" | "same_face" | "spoof" | "continuity" };

async function call(body: object) {
  const res = await fetch(process.env.FACE_URL!, {
    method: "POST",
    // A Modal proxy auth token (modal.com -> Settings -> Proxy Auth Tokens).
    headers: { "Modal-Key": process.env.FACE_TOKEN_ID!, "Modal-Secret": process.env.FACE_TOKEN_SECRET!, "content-type": "application/json" },
    body: JSON.stringify(body),
    // A cold container plus a queue during a class-wide rush stays well under this.
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Face service answered ${res.status}`);
  return res.json();
}

export async function checkFace(challenge: Step[], capture: { frames: string[]; track: string[]; marks: number[] }): Promise<FaceResult> {
  const r = await call({ challenge, frames: capture.frames, track: capture.track, marks: capture.marks });
  // Numbers only (how far each move got), for tuning TURN / TILT in face/app.py. No images are kept.
  if (!r.ok) console.warn(`face check failed: ${r.reason}${r.detail ? ` ${JSON.stringify(r.detail)}` : ""}`);
  return r.ok ? { ok: true, embedding: fromBase64(r.embedding) } : { ok: false, reason: r.reason };
}

// Wakes a container when the lecturer presses Start, so the first student doesn't wait on a cold start.
export const warmFace = () => call({ warm: true }).catch(() => undefined);

export const fromBase64 = (b64: string) => new Float32Array(new Uint8Array(Buffer.from(b64, "base64")).buffer);
export const toBase64 = (e: Float32Array) => Buffer.from(e.buffer, e.byteOffset, e.byteLength).toString("base64");
export const toBlob = (e: Float32Array) => new Uint8Array(e.buffer, e.byteOffset, e.byteLength);
export const fromBlob = (b: ArrayBuffer) => new Float32Array(b.slice(0));

// Both sides are unit length, so the dot product is the cosine.
export function cosine(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Every registered face in a course, cached in Redis as one hash (student id -> base64 embedding).
// The "_" field marks the hash as loaded, so an empty course is cached too.
const embKey = (courseId: string) => `emb:${courseId}`;

async function courseEmbeddings(courseId: string) {
  const cached = await hash(embKey(courseId));
  if (cached?._) {
    delete cached._;
    return Object.entries(cached);
  }
  const rows = await db.execute({ sql: "SELECT id, embedding FROM students WHERE course_id = ? AND embedding IS NOT NULL", args: [courseId] });
  const all = rows.rows.map((r) => [r.id as string, toBase64(fromBlob(r.embedding as ArrayBuffer))] as [string, string]);
  await redis()
    .pipeline()
    .hset(embKey(courseId), { _: "1", ...Object.fromEntries(all) })
    .expire(embKey(courseId), 86_400)
    .exec();
  return all;
}

// The closest registered face in the course, if it counts as a match.
// ponytail: plain loop over the course (~1 ms per 1000 students); Turso vector search past ~50k.
export async function closestMatch(courseId: string, embedding: Float32Array) {
  let best: { id: string; similarity: number } | null = null;
  for (const [id, b64] of await courseEmbeddings(courseId)) {
    const similarity = cosine(embedding, fromBase64(b64));
    if (similarity >= MATCH && (!best || similarity > best.similarity)) best = { id, similarity };
  }
  return best;
}

export async function cacheEmbedding(courseId: string, studentId: string, embedding: Float32Array | null) {
  const key = embKey(courseId);
  // Only touch a loaded hash; an unloaded one fills itself from Turso on next use.
  if (!(await redis().hexists(key, "_"))) return;
  if (embedding) await redis().hset(key, { [studentId]: toBase64(embedding) });
  else await redis().hdel(key, studentId);
}
