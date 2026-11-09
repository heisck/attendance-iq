import { cookies } from "next/headers";
import { fail } from "./api";
import { newId } from "./db";
import { allow, spend } from "./redis";
import type { Step } from "./schemas";
import { COOKIE, isLecturerCookie, seal, unseal } from "./sign";

// A scan ticket: issued when a fresh QR code (or a node token) reaches the server, then carried by the
// face-check submit. Sealed (lib/sign.ts), so issuing one stores nothing; redeeming counts tries in Redis.
// One use, TICKET_TTL_S long, MAX_TRIES face checks. Registration tickets need no code.
export const TICKET_TTL_S = 120;
const MAX_TRIES = 3;

type Ticket = { session: string; node: string; from: string; challenge: Step[] };
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
  no_face: "We lost your face partway. Keep your face filling the oval, in good light, and try again.",
  challenge: "We couldn't see you follow the moves. Try again, turning a bit further each time.",
  same_face: "A different face appeared during the check. One person at a time, please.",
  spoof: "That looked like a photo or a screen. Use your own face, live.",
  continuity: "We lost track of your face. Keep it in the oval the whole time and turn smoothly.",
};

export const faceUnavailable = () => fail(503, "Face check is busy. Wait a few seconds and try again.");

export const isLecturer = async () => isLecturerCookie((await cookies()).get(COOKIE)?.value);
