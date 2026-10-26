import { cookies } from "next/headers";
import { fail, ip, readBody } from "@/lib/api";
import { allow } from "@/lib/redis";
import { loginSchema } from "@/lib/schemas";
import { checkLogin, COOKIE, COOKIE_MAX_AGE_S, lecturerCookie } from "@/lib/sign";

export async function POST(req: Request) {
  const body = await readBody(req, loginSchema);
  if (body instanceof Response) return body;
  if (body.company) return Response.json({ ok: true });
  if (!(await allow(`login:${ip(req)}`, 5, 600))) return fail(429, "Too many attempts. Try again in 10 minutes.");
  if (!checkLogin(body.email, body.password)) return fail(401, "That email and password don't match.");
  (await cookies()).set(COOKIE, lecturerCookie(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return Response.json({ ok: true });
}
