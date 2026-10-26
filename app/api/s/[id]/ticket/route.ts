import { fail, ip, readBody } from "@/lib/api";
import { getSession, newId } from "@/lib/db";
import { pickChallenge } from "@/lib/face";
import { allow } from "@/lib/redis";
import { ticketSchema } from "@/lib/schemas";
import { readCode, readNodeToken } from "@/lib/sign";
import { issueTicket } from "@/lib/ticket";

// Attendance: the phone sends the QR code it just scanned (or, to mark the next person on a phone that
// is already a node, its node token). Registration: no code. Either way: a ticket and a face challenge.
export async function POST(req: Request, { params }: RouteContext<"/api/s/[id]/ticket">) {
  const { id } = await params;
  const body = await readBody(req, ticketSchema);
  if (body instanceof Response) return body;
  const s = await getSession(id);
  if (!s || s.status !== "live") return fail(410, "This session is closed.");

  let node = "";
  let from = "";
  if (s.kind === "registration") {
    // Anyone with the link can ask, so cap it (sized for a class sharing one campus IP).
    if (!(await allow(`reg-ticket:${ip(req)}`, 600, 600))) return fail(429, "Too many attempts from this network. Try again in a few minutes.");
  } else if (body.node) {
    node = readNodeToken(body.node, id) ?? "";
    if (!node) return fail(403, "This phone can't mark people for this session. Scan the class code.");
  } else {
    from = (body.code && readCode(body.code, id)) || "";
    if (!from) return fail(400, "That code expired. Hold steady and scan again.");
    node = newId(10).toUpperCase();
  }

  const challenge = pickChallenge();
  return Response.json({ ticket: await issueTicket({ session: id, node, from, challenge }), challenge });
}
