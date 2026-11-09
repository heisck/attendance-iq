import { fail, readBody } from "@/lib/api";
import { db, getSession } from "@/lib/db";
import { checkFace, cosine, fromBlob, logFace, MARGIN, MATCH, MATCH_1N } from "@/lib/face";
import { attendSchema, FACE_BODY } from "@/lib/schemas";
import { nodeToken, qrKey } from "@/lib/sign";
import { endTicket, FACE_ERRORS, faceUnavailable, redeemTicket, refundTry } from "@/lib/ticket";

export const maxDuration = 60;

// Face check, matched against every registered face in the course: no index number. When the best match
// isn't clearly ahead, the phone asks for the index number and sends the same capture again.
// Success marks them present and makes this tab a node: a node token to mark the next person, and a QR key
// to show its own codes.
export async function POST(req: Request, { params }: RouteContext<"/api/s/[id]/attend">) {
  const { id } = await params;
  const body = await readBody(req, attendSchema, FACE_BODY);
  if (body instanceof Response) return body;
  if (body.company) return Response.json({ ok: true });

  const s = await getSession(id);
  if (!s || s.status !== "live" || s.kind !== "attendance") return fail(410, "This session is closed.");
  const t = await redeemTicket(body.ticket, id);
  if (t instanceof Response) return t;

  // ponytail: every registered face in the course per check (1 row each, ~1 ms of maths per 1000);
  // Turso's vector index if row reads ever cost too much.
  const { rows } = await db.execute({
    sql: `SELECT s.id, s.index_no, s.embedding, s.status, a.marked_at FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id AND a.session_id = ?
      WHERE s.course_id = ? AND s.embedding IS NOT NULL`,
    args: [id, s.courseId],
  });
  const typed = body.indexNo === undefined ? undefined : rows.find((r) => r.index_no === body.indexNo);
  if (body.indexNo !== undefined && !typed)
    return fail(404, `Index number ${body.indexNo} has no registered face for ${s.code}. Check the number, or ask your lecturer.`);
  if (!rows.length) return fail(404, `Nobody has registered a face for ${s.code} yet. Ask your lecturer.`);
  const already = (indexNo: unknown) => fail(409, `Index number ${indexNo} is already marked present for this class.`);
  if (typed?.marked_at) return already(typed.index_no);

  let face;
  try {
    face = await checkFace(t.challenge, body);
  } catch {
    return faceUnavailable(t);
  }
  if (!face.ok) return fail(422, FACE_ERRORS[face.reason]);

  const ranked = rows.map((r) => ({ r, similarity: cosine(face.embedding, fromBlob(r.embedding as ArrayBuffer)) })).sort((a, b) => b.similarity - a.similarity);
  const [top, next] = ranked;
  const margin = top.similarity - (next?.similarity ?? 0);
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const scores = { top: round(top.similarity), margin: round(margin), course: rows.length, ...face.detail };

  let student;
  if (typed) {
    // The typed student must match, and be (about) the best match: nobody marks a lookalike classmate by
    // typing their number, since the student it really is scores higher.
    const similarity = ranked.find((x) => x.r === typed)!.similarity;
    const ok = similarity >= MATCH && similarity >= top.similarity - MARGIN;
    await logFace({ result: ok ? "match" : "no_match", by: "index", similarity: round(similarity), ...scores });
    if (!ok) return fail(422, `Your face didn't match index number ${body.indexNo}. Check the number and try again.`);
    student = typed;
  } else if (top.similarity >= MATCH_1N && margin >= MARGIN) {
    await logFace({ result: "match", by: "face", ...scores });
    student = top.r;
  } else {
    // Not the student's fault: the try comes back, and the same capture goes again with the number.
    await logFace({ result: "need_index", ...scores });
    await refundTry(t);
    return Response.json({ error: "We couldn't tell who you are for sure. Enter your index number to finish.", needIndex: true }, { status: 422 });
  }
  if (student.status !== "active") return fail(403, "Your registration is waiting for your lecturer's approval.");
  if (student.marked_at) return already(student.index_no);

  const markedAt = Date.now();
  const res = await db.execute({
    sql: "INSERT OR IGNORE INTO attendance (session_id, student_id, marked_at, node_id, from_node, method) VALUES (?, ?, ?, ?, ?, 'face')",
    args: [id, student.id, markedAt, t.node, t.from || null],
  });
  if (!res.rowsAffected) return already(student.index_no);
  await endTicket(t);
  // markedAt doubles as the server's clock for this phone's codes; `until` is when the session closes.
  // indexNo: who the face was matched to, so the student sees it was them.
  return Response.json({ ok: true, markedAt, indexNo: student.index_no, node: nodeToken(id, t.node), qr: { key: qrKey(id, t.node), node: t.node, until: s.closesAt } });
}
