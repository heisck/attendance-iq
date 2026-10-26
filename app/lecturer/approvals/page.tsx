"use client";

import { useState } from "react";
import { approvals as initial, courses } from "@/mocks/data";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Person({ name, indexNo, note }: { name: string; indexNo: string; note: string }) {
  return (
    <div className="ap-person">
      <span className="ap-avatar" aria-hidden="true">
        {initials(name)}
      </span>
      <span className="mini-main">
        <strong>{name}</strong>
        <span>
          <span className="mono">{indexNo}</span> · {note}
        </span>
      </span>
    </div>
  );
}

export default function Approvals() {
  const [items, setItems] = useState(initial);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [done, setDone] = useState("");

  function decide(id: string, message: string) {
    setItems((list) => list.filter((a) => a.id !== id));
    setDone(message);
  }

  return (
    <main className="page page-narrow ap">
      <p className="muted">
        {items.length
          ? `${items.length} waiting. Duplicate faces always come here; changed details come here unless the session auto-approves them.`
          : "Nothing waiting. New requests show up here and in the bell during registration."}
      </p>
      {done && (
        <p className="notice notice-ok" role="status">
          {done}
        </p>
      )}

      {items.map((a) => {
        const course = courses.find((c) => c.id === a.courseId)!;
        return (
          <article key={a.id} id={a.id} className="ap-card">
            <div className="ap-head">
              <span className="pill pill-warn">{a.kind === "duplicate_face" ? "Possible duplicate face" : "Changed details"}</span>
              <span className="small muted">
                {course.code} · {a.submittedAt}
              </span>
            </div>

            {a.kind === "duplicate_face" ? (
              <>
                <div className="ap-pair">
                  <Person name={a.student} indexNo={a.indexNo} note="registering now" />
                  <span className="ap-match">
                    <strong>{Math.round(a.similarity * 100)}%</strong> match
                  </span>
                  <Person name={a.matches} indexNo={a.matchesIndexNo} note="already registered" />
                </div>
                <p className="small muted">
                  Check both students in person. If they are different people (twins, for example), add a photo of them together as
                  evidence. The photo is deleted once you decide.
                </p>
                <label className="ap-drop" data-filled={evidence[a.id] ? true : undefined}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => setEvidence((ev) => ({ ...ev, [a.id]: e.target.files?.[0]?.name ?? "" }))}
                  />
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3.5" y="5.5" width="17" height="14" rx="3" />
                    <circle cx="12" cy="12.5" r="3.5" />
                    <path d="M9 5.5 10.5 3.5h3L15 5.5" />
                  </svg>
                  <span>{evidence[a.id] || "Add evidence photo"}</span>
                </label>
                <div className="ap-actions">
                  <button className="btn btn-outline btn-reject" onClick={() => decide(a.id, `${a.student}'s registration rejected.`)}>
                    Reject registration
                  </button>
                  <button
                    className="btn btn-ink"
                    disabled={!evidence[a.id]}
                    onClick={() => decide(a.id, `${a.student} approved as a different person.`)}
                  >
                    Approve as different people
                  </button>
                </div>
              </>
            ) : (
              <>
                <Person name={a.student} indexNo={a.indexNo} note="changed roster details" />
                <dl className="ap-changes">
                  {a.changes.map((c) => (
                    <div key={c.field}>
                      <dt>{c.field}</dt>
                      <dd>
                        <s>{c.from}</s>
                        <svg viewBox="0 0 24 24" aria-label="changed to">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                        <strong>{c.to}</strong>
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="ap-actions">
                  <button className="btn btn-outline btn-reject" onClick={() => decide(a.id, `${a.student}'s changes rejected. Roster details kept.`)}>
                    Keep roster details
                  </button>
                  <button className="btn btn-ink" onClick={() => decide(a.id, `${a.student}'s changes approved.`)}>
                    Approve changes
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}
    </main>
  );
}
