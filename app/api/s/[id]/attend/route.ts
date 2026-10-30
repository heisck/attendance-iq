import { fail, readBody } from "@/lib/api";
import { db, getSession } from "@/lib/db";
import { checkFace, cosine, fromBlob, logFace, MATCH } from "@/lib/face";
import { attendSchema, FACE_BODY } from "@/lib/schemas";
import { nodeToken } from "@/lib/sign";
import { endTicket, FACE_ERRORS, faceUnavailable, redeemTicket } from "@/lib/ticket";

export const maxDuration = 60;

// Face check for one index number, 1:1 against its registered face. Success marks them present and
// makes this tab a node (it gets a node token to show codes and mark the next person).
export async function POST(req: Request, { params }: RouteContext<"/api/s/[id]/attend">) {
  const { id } = await params;
  const body = await readBody(req, attendSchema, FACE_BODY);
  if (body instanceof Response) return body;
  if (body.company) return Response.json({ ok: true });

  const s = await getSession(id);
  if (!s || s.status !== "live" || s.kind !== "attendance") return fail(410, "This session is closed.");
  const t = await redeemTicket(body.ticket, id);
  if (t instanceof Response) return t;

  const { rows } = await db.execute({
    sql: `SELECT s.id, s.embedding, s.status, a.marked_at FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id AND a.session_id = ?
      WHERE s.course_id = ? AND s.index_no = ?`,
    args: [id, s.courseId, body.indexNo],
  });
  const student = rows[0];
  const already = `Index number ${body.indexNo} is already marked present for this class.`;
  if (!student?.embedding) return fail(404, `Index number ${body.indexNo} has no registered face for ${s.code}. Check the number, or ask your lecturer.`);
  if (student.status !== "active") return fail(403, "Your registration is waiting for your lecturer's approval.");
  if (student.marked_at) return fail(409, already);

  let face;
  try {
    face = await checkFace(t.challenge, body);
  } catch {
    return faceUnavailable();
  }
  if (!face.ok) return fail(422, FACE_ERRORS[face.reason]);
  const similarity = cosine(face.embedding, fromBlob(student.embedding as ArrayBuffer));
  await logFace({ result: similarity < MATCH ? "no_match" : "match", similarity: Math.round(similarity * 1000) / 1000 });
  if (similarity < MATCH)
    return fail(422, `Your face didn't match index number ${body.indexNo}. Check the number and try again.`);

  const markedAt = Date.now();
  const res = await db.execute({
    sql: "INSERT OR IGNORE INTO attendance (session_id, student_id, marked_at, node_id, from_node, method) VALUES (?, ?, ?, ?, ?, 'face')",
    args: [id, student.id, markedAt, t.node, t.from || null],
  });
  if (!res.rowsAffected) return fail(409, already);
  await endTicket(body.ticket);
  return Response.json({ ok: true, markedAt, node: nodeToken(id, t.node) });
}
