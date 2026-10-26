import type { z } from "zod";

// Helpers for the public (student and sign-in) route handlers.

export const fail = (status: number, error: string) => Response.json({ error }, { status });

// Vercel sets x-real-ip. A whole classroom can share one campus IP, so per-IP limits on student
// routes are sized for a class, not a person.
export const ip = (req: Request) => req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

// JSON body, at most `limit` bytes (413), validated by `schema` (400). Returns the data, or a Response to send back.
export async function readBody<S extends z.ZodType>(req: Request, schema: S, limit = 32_000): Promise<z.infer<S> | Response> {
  if (Number(req.headers.get("content-length")) > limit) return fail(413, "Request too large");
  const text = await req.text();
  if (Buffer.byteLength(text) > limit) return fail(413, "Request too large");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail(400, "Bad request");
  }
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : fail(400, parsed.error.issues[0]?.message ?? "Bad request");
}
