import { notFound } from "next/navigation";
import { attendance, courses, roster, sessions } from "@/mocks/data";
import { CourseView } from "./CourseView";

export default async function CoursePage({ params }: PageProps<"/lecturer/courses/[id]">) {
  const { id } = await params;
  const course = courses.find((c) => c.id === id);
  if (!course) notFound();
  const weeks = sessions
    .filter((s) => s.courseId === id && s.kind === "attendance" && s.status !== "scheduled")
    .map((s) => s.week);

  return (
    <CourseView
      course={course}
      students={roster.filter((r) => r.courseId === id)}
      weeks={weeks}
      attendance={attendance}
    />
  );
}
