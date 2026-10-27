import { cookies } from "next/headers";
import { fail } from "./api";
import { newId } from "./db";
import { hash, redis } from "./redis";
import type { Step } from "./schemas";
import { COOKIE, isLecturerCookie } from "./sign";

// A scan ticket: issued when a fresh QR code (or a node token) reaches the server, then carried by the
// face-check submit. One use, TICKET_TTL_S long, MAX_TRIES face checks. Registration tickets need no code.
export const TICKET_TTL_S = 120;
const MAX_TRIES = 3;

type Ticket = { session: string; node: string; from: string; challenge: Step[] };

export async function issueTicket(t: Ticket) {
  const ticket = newId(24);
  await redis()
    .pipeline()
    .hset(`t:${ticket}`, { ...t, challenge: JSON.stringify(t.challenge) })
    .expire(`t:${ticket}`, TICKET_TTL_S)
    .exec();
  return ticket;
}

// The ticket, or a 401 telling the phone to scan again.
export async function redeemTicket(ticket: string, sessionId: string): Promise<Ticket | Response> {
  const key = `t:${ticket}`;
  const t = await hash(key);
  const rescan = (error: string) => Response.json({ error, rescan: true }, { status: 401 });
  if (!t || t.session !== sessionId) return rescan("Your scan expired. Scan the code again.");
  if ((await redis().hincrby(key, "tries", 1)) > MAX_TRIES) {
    await redis().del(key);
    return rescan("Too many tries. Scan the code again.");
  }
  return { session: t.session, node: t.node, from: t.from, challenge: JSON.parse(t.challenge) };
}

export const endTicket = (ticket: string) => redis().del(`t:${ticket}`);

export const FACE_ERRORS = {
  no_face: "We lost your face partway. Keep your face filling the oval, in good light, and try again.",
  challenge: "We couldn't see you follow the moves. Try again, turning a bit further each time.",
  same_face: "A different face appeared during the check. One person at a time, please.",
  spoof: "That looked like a photo or a screen. Use your own face, live.",
  continuity: "We lost track of your face. Keep it in the oval the whole time and turn smoothly.",
};

export const faceUnavailable = () => fail(503, "Face check is busy. Wait a few seconds and try again.");

export const isLecturer = async () => isLecturerCookie((await cookies()).get(COOKIE)?.value);
