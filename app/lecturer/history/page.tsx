import { level, listSessions } from "@/lib/db";
import { Filters } from "../Filters";
import { one, SessionRow, sorted } from "../SessionRow";

export default async function History({ searchParams }: PageProps<"/lecturer/history">) {
  const q = await searchParams;
  const course = one(q.course);
  const week = one(q.week);
  const lvl = one(q.level);
  const past = (await listSessions()).filter((s) => s.status === "closed").sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const shown = past.filter((s) => (!course || s.courseId === course) && (!week || String(s.week) === week) && (!lvl || level(s.code) === lvl));

  // Options come from the closed sessions, so every choice matches at least one.
  const courses = new Map(past.map((s) => [s.courseId, s.code]));
  const weeks = new Map(past.map((s) => [String(s.week), `Week ${s.week}`]));
  const levels = new Map(past.filter((s) => level(s.code)).map((s) => [level(s.code), `Level ${level(s.code)}`]));

  return (
    <main className="page page-narrow">
      <p className="muted">Closed sessions, newest first. Open one to see who was there.</p>
      {past.length > 0 && (
        <Filters
          filters={[
            { name: "course", label: "Course", value: course, options: sorted(courses) },
            { name: "week", label: "Week", value: week, options: sorted(weeks, true) },
            { name: "level", label: "Level", value: lvl, options: sorted(levels, true) },
          ]}
        />
      )}
      {shown.length ? (
        <ul className="srows">
          {shown.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </ul>
      ) : (
        <p className="muted">{past.length ? "No closed sessions match these filters." : "No sessions have closed yet."}</p>
      )}
    </main>
  );
}
