import { fail, ip } from "@/lib/api";
import { db, getSession } from "@/lib/db";
import { allow } from "@/lib/redis";

// Masked so the suggestion list can't be used to harvest classmates' details.
function mask(field: "email" | "other", value: string) {
  if (field === "email") {
    const [user, domain] = value.split("@");
    return `${user[0]}••••@${domain}`;
  }
  return `••••${value.slice(-3)}`;
}

// Registration name lookup: 3+ letters, up to 5 unregistered roster names, other details masked.
export async function GET(req: Request, { params }: RouteContext<"/api/s/[id]/roster">) {
  const { id } = await params;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 60) return Response.json([]);
  const s = await getSession(id);
  if (!s || s.status !== "live" || s.kind !== "registration") return fail(410, "This session is closed.");
  if (!(await allow(`roster:${ip(req)}`, 1500, 600))) return fail(429, "Too many searches from this network. Try again in a few minutes.");

  const res = await db.execute({
    sql: "SELECT id, name, email, student_no, index_no FROM students WHERE course_id = ? AND embedding IS NULL AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 5",
    args: [s.courseId, `%${q.replace(/[\\%_]/g, "\\$&")}%`],
  });
  return Response.json(
    res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: mask("email", r.email as string),
      studentNo: mask("other", r.student_no as string),
      indexNo: mask("other", r.index_no as string),
    })),
  );
}
