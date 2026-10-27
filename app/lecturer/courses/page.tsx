import Link from "next/link";
import { listCourses, listSessions } from "@/lib/db";
import { day, progress } from "../SessionRow";

export default async function Courses() {
  const [courses, sessions] = await Promise.all([listCourses(), listSessions()]);
  return (
    <main className="page">
      {courses.length === 0 && <p className="muted">No courses yet. Press + to create a session and add a new course with it.</p>}
      <div className="course-cards">
        {courses.map((c) => {
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
