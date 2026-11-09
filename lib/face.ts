import { db } from "./db";
import { redis } from "./redis";
import { COLORS, type Challenge } from "./challenge";

// Modal does the heavy compute (face/app.py) and returns an embedding; matching happens here.

// SFace cosine similarity at or above this = same person (OpenCV's published threshold). Used where the
// student said who they are (an index number), and for duplicates at registration.
export const MATCH = 0.363;
// With no index number, the best face in the course is taken only if it scores at least MATCH_1N and beats
// the runner-up by MARGIN; otherwise the phone asks for the index number. Set from SFace on LFW (5,749
// public figures, one photo enrolled, another as the probe; 3,000 simulated check-ins per class size):
// classes of 50-300 got ~90% matched with no number, ~10% asked for it, 0.03% matched to the wrong person;
// 600-1000 the same, but 0.17% wrong, flat however high the bar went (LFW's own mislabelled duplicates,
// most likely). Real check-ins should do better (same phone setup, four frames averaged). Retune on real
// classes with `npm run facelog` (need_index vs match, top and margin).
export const MATCH_1N = 0.52;
export const MARGIN = 0.1;

// detail: the check's scores (numbers only), for the one log entry the caller writes on a pass.
export type FaceResult =
  | { ok: true; embedding: Float32Array; detail?: object }
  | { ok: false; reason: "no_face" | "approach" | "smile" | "flash" | "same_face" | "spoof" | "continuity" };

async function call(body: object) {
  const json = JSON.stringify(body);
  // A cold container plus a queue during a class-wide rush stays well under this (routes allow 60 s).
  const deadline = Date.now() + 45_000;
  const once = async () => {
    const res = await fetch(process.env.FACE_URL!, {
      method: "POST",
      // A Modal proxy auth token (modal.com -> Settings -> Proxy Auth Tokens).
      headers: { "Modal-Key": process.env.FACE_TOKEN_ID!, "Modal-Secret": process.env.FACE_TOKEN_SECRET!, "content-type": "application/json" },
      body: json,
      signal: AbortSignal.timeout(deadline - Date.now()),
    });
    if (!res.ok) throw new Error(`Face service answered ${res.status}`);
    return res.json();
  };
  // A blip (dropped connection, 5xx) resends the same images once instead of making the student film again.
  // A timeout doesn't: the budget is spent.
  return once().catch((e) => {
    if (e?.name === "TimeoutError" || deadline - Date.now() < 5_000) throw e;
    return once();
  });
}

export async function checkFace(challenge: Challenge, capture: { frames: string[]; track: string[]; marks: number[]; times: number[] }): Promise<FaceResult> {
  const { frames, track, marks, times } = capture;
  const r = await call({ frames, track, marks, times, colors: challenge.colors.map((i) => COLORS[i]), oval: challenge.oval, smiles: challenge.smiles });
  // Numbers only (each check's scores), for tuning the knobs in face/app.py. No images are kept.
  if (!r.ok) console.warn(`face check failed: ${r.reason}${r.detail ? ` ${JSON.stringify(r.detail)}` : ""}`);
  // A pass is logged once by the caller, together with what it did next (match score, or registered).
  if (!r.ok) await logFace({ result: r.reason, ...r.detail });
  return r.ok ? { ok: true, embedding: fromBase64(r.embedding), detail: r.detail } : { ok: false, reason: r.reason };
}

// The last 5000 face checks and match scores, numbers only (no images, no student ids), so tuning
// doesn't depend on Vercel's 1-hour log retention. Read with `npm run facelog`.
// Trimmed on about 1 push in 20, which halves its Redis commands; the list overshoots by a few dozen at most.
export const logFace = async (entry: object) => {
  const p = redis().pipeline().lpush("facelog", JSON.stringify({ t: Date.now(), ...entry }));
  if (Math.random() < 0.05) p.ltrim("facelog", 0, 4999);
  await p.exec().catch(() => undefined);
};

// Wakes a container when the lecturer presses Start, so the first student doesn't wait on a cold start.
export const warmFace = () => call({ warm: true }).catch(() => undefined);

export const fromBase64 = (b64: string) => new Float32Array(new Uint8Array(Buffer.from(b64, "base64")).buffer);
export const toBlob = (e: Float32Array) => new Uint8Array(e.buffer, e.byteOffset, e.byteLength);
export const fromBlob = (b: ArrayBuffer) => new Float32Array(b.slice(0));

// Both sides are unit length, so the dot product is the cosine.
export function cosine(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// The closest registered face in the course, if it counts as a match.
// ponytail: plain loop over the course (~1 ms per 1000 students); Turso vector search past ~50k.
export async function closestMatch(courseId: string, embedding: Float32Array) {
  let best: { id: string; similarity: number } | null = null;
  // Read fresh from Turso each time (one row per registered student): a cache shared across instances
  // would cost as much to keep in sync, and a stale one would miss someone registering twice.
  const { rows } = await db.execute({ sql: "SELECT id, embedding FROM students WHERE course_id = ? AND embedding IS NOT NULL", args: [courseId] });
  for (const r of rows) {
    const id = r.id as string;
    const similarity = cosine(embedding, fromBlob(r.embedding as ArrayBuffer));
    if (similarity >= MATCH && (!best || similarity > best.similarity)) best = { id, similarity };
  }
  return best;
}
