import Link from "next/link";
import type { Session } from "@/lib/db";
import { today } from "@/lib/time";

export const KIND = { registration: "Registration", attendance: "Attendance" };

// Dates are plain YYYY-MM-DD; read them as UTC so the day never shifts with the server's timezone.
export function day(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
}

// Who's present (attendance) or registered (registration) out of the course roster.
export const progress = (s: Session) => ({ done: s.done, total: s.total, label: s.kind === "registration" ? "registered" : "present" });

export function SessionRow({ s }: { s: Session }) {
  const p = progress(s);
  return (
    <li>
      <Link href={`/lecturer/session/${s.id}`} className="srow" data-today={s.date === today() || undefined}>
        <span className="srow-date">
          <span className="srow-day">{day(s.date, { day: "numeric" })}</span>
          <span className="srow-month">{day(s.date, { month: "short" })}</span>
        </span>
        <span className="srow-main">
          <strong>{s.code}</strong> <span className="muted">{s.courseName}</span>
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
