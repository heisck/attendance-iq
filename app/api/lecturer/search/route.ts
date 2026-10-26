import { fail } from "@/lib/api";
import { searchIndex } from "@/lib/db";
import { isLecturer } from "@/lib/ticket";

export async function GET() {
  if (!(await isLecturer())) return fail(401, "Sign in first");
  return Response.json(await searchIndex());
}
