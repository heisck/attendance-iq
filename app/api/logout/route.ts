import { cookies } from "next/headers";
import { COOKIE } from "@/lib/sign";

// A form POST, not a link, so prefetching can't sign anyone out. Relative Location keeps the
// browser on whatever host it used (req.url can name the server's own host instead).
export async function POST() {
  (await cookies()).delete(COOKIE);
  return new Response(null, { status: 303, headers: { location: "/login" } });
}
