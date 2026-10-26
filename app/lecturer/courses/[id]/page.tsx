import { notFound } from "next/navigation";
import { courseMarks, listCourses, listSessions, listStudents } from "@/lib/db";
import { CourseView } from "./CourseView";

export default async function CoursePage({ params }: PageProps<"/lecturer/courses/[id]">) {
  const { id } = await params;
  const [courses, sessions, students, marks] = await Promise.all([listCourses(), listSessions(), listStudents(id), courseMarks(id)]);
  const course = courses.find((c) => c.id === id);
  if (!course) notFound();
  // One column per attendance session that has opened, in week order.
  const columns = sessions
    .filter((s) => s.courseId === id && s.kind === "attendance" && s.status !== "scheduled")
    .sort((a, b) => a.week - b.week || a.opensAt - b.opensAt)
    .map((s) => ({ id: s.id, week: s.week }));

  return <CourseView course={course} students={students} columns={columns} marks={marks} />;
}
