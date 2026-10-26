import Link from "next/link";
import { courses, roster, sessions } from "@/mocks/data";
import { day, progress } from "../SessionRow";

export default function Courses() {
  return (
    <main className="page">
      <div className="course-cards">
        {courses.map((c) => {
          const students = roster.filter((r) => r.courseId === c.id);
          const registered = students.filter((s) => s.registered).length;
          const mine = sessions.filter((s) => s.courseId === c.id);
          const last = mine.filter((s) => s.kind === "attendance" && s.status === "closed").sort((a, b) => b.date.localeCompare(a.date))[0];
          const next = mine.filter((s) => s.status === "scheduled").sort((a, b) => a.date.localeCompare(b.date))[0];
          const turnout = last && progress(last);
          return (
            <Link key={c.id} href={`/lecturer/courses/${c.id}`} className="course-card">
              <span className="course-code">{c.code}</span>
              <span className="muted">{c.name}</span>
              <span className="bar bar-light" aria-hidden="true">
                <span style={{ width: students.length ? `${(registered / students.length) * 100}%` : 0 }} />
              </span>
              <span className="small muted">
                {students.length ? `${registered} of ${students.length} registered` : "No students on the roster yet"}
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
