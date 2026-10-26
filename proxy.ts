import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, isLecturerCookie } from "@/lib/sign";

// Lecturer pages, lecturer APIs and the server actions posted to those pages need the sign-in cookie.
// Server actions and API handlers check it again themselves.
export function proxy(req: NextRequest) {
  if (isLecturerCookie(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return Response.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/lecturer/:path*", "/api/lecturer/:path*"] };
