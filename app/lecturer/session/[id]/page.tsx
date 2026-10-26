import { notFound } from "next/navigation";
import { courses, nodes, roster, sessions } from "@/mocks/data";
import { LiveSession } from "./LiveSession";

export default async function SessionPage({ params }: PageProps<"/lecturer/session/[id]">) {
  const { id } = await params;
  const session = sessions.find((s) => s.id === id);
  if (!session) notFound();
  const course = courses.find((c) => c.id === session.courseId)!;
  const total = roster.filter((r) => r.courseId === course.id).length;

  // Mock: the sample phones belong to the live session; a scheduled one has none yet.
  return <LiveSession session={session} course={course} total={total} nodes={session.status === "scheduled" ? [] : nodes} />;
}
