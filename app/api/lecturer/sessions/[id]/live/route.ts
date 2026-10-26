import { fail } from "@/lib/api";
import { getSession, liveNodes, sessionCounts } from "@/lib/db";
import { isLecturer } from "@/lib/ticket";

// Polled by the session page every few seconds.
export async function GET(_req: Request, { params }: RouteContext<"/api/lecturer/sessions/[id]/live">) {
  if (!(await isLecturer())) return fail(401, "Sign in first");
  const { id } = await params;
  const s = await getSession(id, true);
  if (!s) return fail(404, "No such session");
  const [counts, nodes] = await Promise.all([sessionCounts(s), s.kind === "attendance" ? liveNodes(id) : []]);
  return Response.json({ status: s.status, startedAt: s.startedAt, ...counts, nodes });
}
