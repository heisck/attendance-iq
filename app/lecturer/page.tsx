import Link from "next/link";
import { listCourses, listSessions } from "@/lib/db";
import { KIND, progress, Ring, SessionRow } from "./SessionRow";

export default async function Dashboard() {
  const [sessions, courses] = await Promise.all([listSessions(), listCourses()]);
  const live = sessions.filter((s) => s.status === "live");
  const schedule = sessions
    .filter((s) => s.status !== "closed")
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const last = sessions
    .filter((s) => s.kind === "attendance" && s.status === "closed" && s.startedAt)
    .sort((a, b) => b.startedAt! - a.startedAt!)[0];
  const turnout = last && progress(last);

  return (
    <main className="page dash">
      <div className="dash-cols">
        <div className="dash-stack">
          {live.length > 0 && (
            <section className="dash-section" aria-labelledby="live-h">
              <h2 id="live-h">Live now</h2>
              <div className="live-cards">
                {live.map((s) => {
                  const p = progress(s);
                  return (
                    <article key={s.id} className="live-card">
                      <span className="live-finder" aria-hidden="true" />
                      <span className="pill pill-live">Live</span>
                      <h3 className="live-code">{s.code}</h3>
                      <p className="live-name">{s.courseName}</p>
                      <p className="live-meta">
                        {KIND[s.kind]} · Week {s.week} · {s.start}–{s.end}
                      </p>
                      <div className="live-progress">
                        <span>
                          <strong>{p.done}</strong> of {p.total} {p.label}
                        </span>
                        <span className="bar" aria-hidden="true">
                          <span style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
                        </span>
                      </div>
                      <Link href={`/lecturer/session/${s.id}`} className="btn btn-light">
                        Open live view
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section className="dash-section" aria-labelledby="up-h">
            <div className="dash-row">
              <h2 id="up-h">Schedule</h2>
              <Link href="/lecturer/history" className="dash-link">
                See past sessions
              </Link>
            </div>
            {schedule.length ? (
              <ul className="srows">
                {schedule.map((s) => (
                  <SessionRow key={s.id} s={s} />
                ))}
              </ul>
            ) : (
              <p className="muted">Nothing scheduled. Press + to create a session.</p>
            )}
          </section>
        </div>

        <aside className="dash-aside">
          <section className="dash-section dash-courses" aria-labelledby="courses-h">
            <div className="dash-row">
              <h2 id="courses-h">My courses</h2>
              <Link href="/lecturer/courses" className="dash-link">
                All courses
              </Link>
            </div>
            {courses.length === 0 && <p className="muted">No courses yet. Press + to create a session and add one.</p>}
            <ul className="mini-courses">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link href={`/lecturer/courses/${c.id}`} className="mini-course">
                    <span className="mini-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M2.5 9.5 12 5l9.5 4.5L12 14zM6.5 11.7V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.3M21.5 9.5V15" />
                      </svg>
                    </span>
                    <span className="mini-main">
                      <strong>{c.code}</strong>
                      <span>{c.students} students</span>
                    </span>
                    <svg className="mini-go" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10 6l6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {turnout && turnout.total > 0 && (
            <section className="dash-section" aria-labelledby="turnout-h">
              <h2 id="turnout-h">Last turnout</h2>
              <div className="turnout">
                <Ring pct={(turnout.done / turnout.total) * 100} />
                <strong className="turnout-pct">{Math.round((turnout.done / turnout.total) * 100)}%</strong>
              </div>
              <p className="small muted turnout-note">
                {turnout.done} of {turnout.total} present · {last.code} week {last.week}
              </p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
