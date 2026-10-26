import Link from "next/link";
import { attendance, courses, roster, type Session } from "@/mocks/data";

export const KIND = { registration: "Registration", attendance: "Attendance" };
export const TODAY = "2026-10-26"; // Mock clock; the server's date once data is real.

// Dates are plain YYYY-MM-DD; read them as UTC so the day never shifts with the server's timezone.
export function day(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
}

// Who's present (attendance) or registered (registration) out of the course roster.
export function progress(s: Session) {
  const students = roster.filter((r) => r.courseId === s.courseId);
  const done =
    s.kind === "registration"
      ? students.filter((r) => r.registered).length
      : students.filter((r) => attendance[s.week]?.includes(r.id)).length;
  return { done, total: students.length, label: s.kind === "registration" ? "registered" : "present" };
}

export function SessionRow({ s }: { s: Session }) {
  const c = courses.find((c) => c.id === s.courseId)!;
  const p = progress(s);
  return (
    <li>
      <Link href={`/lecturer/session/${s.id}`} className="srow" data-today={s.date === TODAY || undefined}>
        <span className="srow-date">
          <span className="srow-day">{day(s.date, { day: "numeric" })}</span>
          <span className="srow-month">{day(s.date, { month: "short" })}</span>
        </span>
        <span className="srow-main">
          <strong>{c.code}</strong> <span className="muted">{c.name}</span>
          <span className="srow-meta">
            {KIND[s.kind]} · Week {s.week} · {day(s.date, { weekday: "short" })}
          </span>
        </span>
        {s.status === "closed" ? (
          <span className="srow-side">
            <strong>
              {p.done}/{p.total}
            </strong>{" "}
            {p.label}
          </span>
        ) : (
          <span className="srow-side">
            {s.start}–{s.end}
          </span>
        )}
      </Link>
    </li>
  );
}

const TICKS = 48;

// Segmented ring: TICKS spokes, the first `pct` percent of them inked.
export function Ring({ pct }: { pct: number }) {
  return (
    <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
      {Array.from({ length: TICKS }, (_, i) => (
        <line key={i} x1="50" y1="3" x2="50" y2="14" transform={`rotate(${(i * 360) / TICKS} 50 50)`} data-on={i < (pct / 100) * TICKS || undefined} />
      ))}
    </svg>
  );
}
