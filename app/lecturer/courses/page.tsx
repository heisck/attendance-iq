import Link from "next/link";
import { level, listCourses, listSessions } from "@/lib/db";
import { Filters } from "../Filters";
import { day, one, progress, sorted } from "../SessionRow";

export default async function Courses({ searchParams }: PageProps<"/lecturer/courses">) {
  const q = await searchParams;
  const course = one(q.course);
  const week = one(q.week);
  const lvl = one(q.level);
  const [courses, sessions] = await Promise.all([listCourses(), listSessions()]);
  // Week keeps the courses that have a session in that week.
  const shown = courses.filter(
    (c) => (!course || c.id === course) && (!lvl || level(c.code) === lvl) && (!week || sessions.some((s) => s.courseId === c.id && String(s.week) === week)),
  );
  return (
    <main className="page">
      {courses.length === 0 && <p className="muted">No courses yet. Press + to create a session and add a new course with it.</p>}
      {courses.length > 0 && (
        <Filters
          filters={[
            { name: "course", label: "Course", value: course, options: sorted(new Map(courses.map((c) => [c.id, c.code]))) },
            { name: "week", label: "Week", value: week, options: sorted(new Map(sessions.map((s) => [String(s.week), `Week ${s.week}`])), true) },
            {
              name: "level",
              label: "Level",
              value: lvl,
              options: sorted(new Map(courses.filter((c) => level(c.code)).map((c) => [level(c.code), `Level ${level(c.code)}`])), true),
            },
          ]}
        />
      )}
      {courses.length > 0 && shown.length === 0 && <p className="muted">No courses match these filters.</p>}
      <div className="course-cards">
        {shown.map((c) => {
          const { students, registered } = c;
          const mine = sessions.filter((s) => s.courseId === c.id);
          const last = mine.filter((s) => s.kind === "attendance" && s.status === "closed" && s.startedAt).sort((a, b) => b.startedAt! - a.startedAt!)[0];
          const next = mine.filter((s) => s.status === "scheduled").sort((a, b) => a.date.localeCompare(b.date))[0];
          const turnout = last && progress(last);
          return (
            <Link key={c.id} href={`/lecturer/courses/${c.id}`} className="course-card">
              <span className="course-code">{c.code}</span>
              <span className="muted">{c.name}</span>
              <span className="bar bar-light" aria-hidden="true">
                <span style={{ width: students ? `${(registered / students) * 100}%` : 0 }} />
              </span>
              <span className="small muted">
                {students ? `${registered} of ${students} registered` : "No students on the roster yet"}
              </span>
              <dl className="course-facts">
                <div>
                  <dt>Sessions</dt>
                  <dd>{mine.length}</dd>
                </div>
                <div>
                  <dt>Last turnout</dt>
                  <dd>{turnout ? `${turnout.done}/${turnout.total}` : "None yet"}</dd>
                </div>
                <div>
                  <dt>Next</dt>
                  <dd>{next ? day(next.date, { day: "numeric", month: "short" }) : "None"}</dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
