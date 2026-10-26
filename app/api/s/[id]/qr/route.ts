import { fail } from "@/lib/api";
import { getSession } from "@/lib/db";
import { makeCode, readNodeToken } from "@/lib/sign";
import { isLecturer } from "@/lib/ticket";

export const maxDuration = 300;
// End a little before maxDuration; EventSource reconnects on its own (after `retry` ms).
const STREAM_MS = 280_000;
const RECHECK_EVERY = 5;

// Rotating QR codes as Server-Sent Events: one signed code per second, made on the server so phones
// never hold the secret. One long response per screen instead of a request per second.
// Lecturer's screen: the sign-in cookie. A student node: ?node=<node token>.
export async function GET(req: Request, { params }: RouteContext<"/api/s/[id]/qr">) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("node");
  const node = token ? readNodeToken(token, id) : (await isLecturer()) ? "lecturer" : null;
  if (!node) return fail(403, "Not allowed to show codes for this session.");
  const live = async () => {
    const s = await getSession(id, node === "lecturer");
    return s?.status === "live" && s.kind === "attendance";
  };
  if (!(await live())) return fail(410, "This session is closed.");

  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval>;
  let done = false;
  const stream = new ReadableStream({
    start(controller) {
      const started = Date.now();
      let ticks = 0;
      // A tick still awaiting the session check can finish after the stream ended.
      const send = (text: string) => !done && controller.enqueue(enc.encode(text));
      const stop = () => {
        if (done) return;
        done = true;
        clearInterval(timer);
        controller.close();
      };
      const tick = async () => {
        if (Date.now() - started > STREAM_MS) return stop();
        if (++ticks % RECHECK_EVERY === 0 && !(await live())) {
          send("event: closed\ndata: \n\n");
          return stop();
        }
        send(`data: ${makeCode(id, node)}\n\n`);
      };
      send("retry: 500\n\n");
      tick();
      timer = setInterval(tick, 1000);
    },
    cancel() {
      done = true;
      clearInterval(timer);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}
