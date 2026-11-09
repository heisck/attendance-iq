import { listCourses, listSessions } from "@/lib/db";
import { NewSession } from "./NewSession";

export default async function NewSessionPage() {
  const [courses, sessions] = await Promise.all([listCourses(), listSessions()]);
  // Default week per course: one after the latest attendance session that was actually held (opened).
  const nextWeek: Record<string, number> = {};
  for (const s of sessions) if (s.kind === "attendance" && s.startedAt) nextWeek[s.courseId] = Math.max(nextWeek[s.courseId] ?? 1, s.week + 1);
  return <NewSession courses={courses} nextWeek={nextWeek} />;
}
