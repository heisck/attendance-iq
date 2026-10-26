import type { InStatement } from "@libsql/client";
import { fail, ip, readBody } from "@/lib/api";
import { db, getSession, newId } from "@/lib/db";
import { cacheEmbedding, checkFace, closestMatch, toBlob } from "@/lib/face";
import { allow } from "@/lib/redis";
import { FIELDS, registerSchema, studentFields, type Field } from "@/lib/schemas";
import { endTicket, FACE_ERRORS, faceUnavailable, redeemTicket } from "@/lib/ticket";

export const maxDuration = 60;

const KEYS = Object.keys(FIELDS) as Field[];

// Claim a roster entry (or add yourself if you're not listed) and enrol a face.
// Retyped details that differ from the roster are edits: applied, or sent to the lecturer, per the session.
// A face close to someone already registered goes to the lecturer as a possible duplicate.
export async function POST(req: Request, { params }: RouteContext<"/api/s/[id]/register">) {
  const { id } = await params;
  const body = await readBody(req, registerSchema, 300_000);
  if (body instanceof Response) return body;
  if (body.company) return Response.json({ ok: true, status: "active" });

  const s = await getSession(id);
  if (!s || s.status !== "live" || s.kind !== "registration") return fail(410, "This session is closed.");
  // Each attempt costs a face check, and registration tickets need no QR code, so cap per network too.
  if (!(await allow(`register:${ip(req)}`, 600, 600))) return fail(429, "Too many attempts from this network. Try again in a few minutes.");
  const t = await redeemTicket(body.ticket, id);
  if (t instanceof Response) return t;

  // What the roster says, if they picked a name, then what they end up with after their edits.
  let roster: Record<Field, string> | null = null;
  if (body.rosterId) {
    const r = (await db.execute({ sql: "SELECT * FROM students WHERE id = ? AND course_id = ?", args: [body.rosterId, s.courseId] })).rows[0];
    if (!r || r.embedding) return fail(409, "That name is already registered. Ask your lecturer if it's you.");
    roster = { name: r.name as string, email: r.email as string, studentNo: r.student_no as string, indexNo: r.index_no as string };
  }
  const parsed = studentFields.safeParse({ ...roster, ...body.fields });
  if (!parsed.success) return fail(400, parsed.error.issues[0].message);
  const details = parsed.data;
  const changes = KEYS.filter((k) => !roster || details[k] !== roster[k]).map((k) => ({ key: k, from: roster?.[k] ?? "", to: details[k] }));

  if (changes.some((c) => c.key === "indexNo")) {
    const taken = await db.execute({ sql: "SELECT 1 FROM students WHERE course_id = ? AND index_no = ?", args: [s.courseId, details.indexNo] });
    if (taken.rows.length) return fail(409, `Index number ${details.indexNo} is already on the roster. Search for your name instead, or ask your lecturer.`);
  }

  let face;
  try {
    face = await checkFace(t.challenge, body.frames);
  } catch {
    return faceUnavailable();
  }
  if (!face.ok) return fail(422, FACE_ERRORS[face.reason]);

  // ponytail: two lookalikes registering in the same instant can miss each other; the lecturer's roster is the backstop.
  const duplicate = await closestMatch(s.courseId, face.embedding);
  const needsEdit = changes.length > 0 && !s.autoApproveEdits;
  const status = duplicate ? "pending_duplicate" : needsEdit ? "pending_edit" : "active";
  // Edits waiting on the lecturer leave the roster details in place until approved.
  const stored = needsEdit && roster ? roster : details;
  const embedding = toBlob(face.embedding);
  const studentId = body.rosterId ?? newId();

  const statements: InStatement[] = [
    roster
      ? {
          sql: "UPDATE students SET name = ?, email = ?, student_no = ?, index_no = ?, embedding = ?, status = ? WHERE id = ? AND embedding IS NULL",
          args: [...KEYS.map((k) => stored[k]), embedding, status, studentId],
        }
      : {
          sql: "INSERT INTO students (id, course_id, name, email, student_no, index_no, embedding, status, on_roster) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
          args: [studentId, s.courseId, ...KEYS.map((k) => stored[k]), embedding, status],
        },
  ];
  // Approvals only land if the row now holds this request's face, so a lost race on the same roster entry adds nothing.
  const approval = (kind: string, payload: object): InStatement => ({
    sql: "INSERT INTO approvals (id, kind, student_id, payload, created_at) SELECT ?, ?, id, ?, ? FROM students WHERE id = ? AND embedding = ?",
    args: [newId(), kind, JSON.stringify(payload), Date.now(), studentId, embedding],
  });
  if (duplicate) statements.push(approval("duplicate_face", { matchId: duplicate.id, similarity: duplicate.similarity }));
  if (needsEdit) statements.push(approval("edit", { changes }));

  try {
    const [claim] = await db.batch(statements, "write");
    if (!claim.rowsAffected) return fail(409, "That name was just registered. Ask your lecturer if it's you.");
  } catch (e) {
    if (String(e).includes("UNIQUE")) return fail(409, `Index number ${details.indexNo} is already registered. Ask your lecturer.`);
    throw e;
  }
  await Promise.all([endTicket(body.ticket), cacheEmbedding(s.courseId, studentId, face.embedding)]);
  return Response.json({ ok: true, status: status === "active" ? "active" : "pending" });
}
