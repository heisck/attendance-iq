import { fail } from "@/lib/api";
import { getSession, liveNodes } from "@/lib/db";
import { isLecturer } from "@/lib/ticket";

// Polled by the session page every few seconds. One session row carries status and counts; the phone
// list (a read of every mark) is only sent when the count differs from the page's `?done=`.
export async function GET(req: Request, { params }: RouteContext<"/api/lecturer/sessions/[id]/live">) {
  if (!(await isLecturer())) return fail(401, "Sign in first");
  const { id } = await params;
  const s = await getSession(id, true);
  if (!s) return fail(404, "No such session");
  const seen = new URL(req.url).searchParams.get("done");
  const nodes = s.kind === "attendance" && seen !== String(s.done) ? await liveNodes(id) : undefined;
  // now: the server's clock, which the page's own QR codes must carry.
  return Response.json({ now: Date.now(), status: s.status, startedAt: s.startedAt, done: s.done, total: s.total, nodes });
}
