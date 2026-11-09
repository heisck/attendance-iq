import { cookies } from "next/headers";
import { fail } from "./api";
import { newId } from "./db";
import { allow, refund, spend } from "./redis";
import type { Challenge } from "./challenge";
import { COOKIE, isLecturerCookie, seal, unseal } from "./sign";

// A scan ticket: issued when a fresh QR code (or a node token) reaches the server, then carried by the
// face-check submit. Sealed (lib/sign.ts), so issuing one stores nothing; redeeming counts tries in Redis.
// One use, TICKET_TTL_S long, MAX_TRIES face checks. Registration tickets need no code.
export const TICKET_TTL_S = 120;
const MAX_TRIES = 3;

type Ticket = { session: string; node: string; from: string; challenge: Challenge };
type Issued = Ticket & { id: string; exp: number };

export const issueTicket = (t: Ticket) => seal("ticket", { ...t, id: newId(16), exp: Date.now() + TICKET_TTL_S * 1000 });

// The ticket, or a 401 telling the phone to scan again.
export async function redeemTicket(ticket: string, sessionId: string): Promise<Issued | Response> {
  const t = unseal<Issued>("ticket", ticket);
  const rescan = (error: string) => Response.json({ error, rescan: true }, { status: 401 });
  if (!t || t.session !== sessionId || t.exp < Date.now()) return rescan("Your scan expired. Scan the code again.");
  if (!(await allow(`t:${t.id}`, MAX_TRIES, TICKET_TTL_S))) return rescan("Too many tries. Scan the code again.");
  return t;
}

// After a success: spends the tries left, so one scan can't mark a second person.
export const endTicket = (t: Issued) => spend(`t:${t.id}`, MAX_TRIES);

export const FACE_ERRORS = {
  no_face: "We lost your face partway. Keep your face in the oval the whole time, and try again.",
  approach: "We couldn't see you come closer. Bring the phone in until your face fills the oval.",
  flash: "We couldn't see the screen's light on your face. Get out of direct sunlight, turn your screen brightness up, and try again.",
  same_face: "A different face appeared during the check. One person at a time, please.",
  spoof: "That looked like a photo or a screen. Use your own face, live.",
  continuity: "We lost track of your face. Keep it in the oval the whole time and move smoothly.",
};

// For outcomes that aren't the student's fault (the face service down, a face we couldn't place).
export const refundTry = (t: Issued) => refund(`t:${t.id}`);

// error: why the face service call failed, logged (message only) so "busy" can be traced.
export async function faceUnavailable(t: Issued, error: unknown) {
  console.error(`face service unavailable: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  await refundTry(t);
  return fail(503, "Face check is busy. Wait a few seconds and try again.");
}

export const isLecturer = async () => isLecturerCookie((await cookies()).get(COOKIE)?.value);
