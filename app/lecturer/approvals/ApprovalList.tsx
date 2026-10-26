"use client";

import { useState } from "react";
import { decideApproval } from "@/lib/actions";
import type { Approval } from "@/lib/db";

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

export function ApprovalList({ items }: { items: Approval[] }) {
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  // The list itself refreshes from the server once the decision is saved.
  async function decide(id: string, approve: boolean, message: string) {
    setBusy(id);
    try {
      const r = await decideApproval(id, approve);
      setDone(r ? { ok: false, text: r.error } : { ok: true, text: message });
    } catch {
      setDone({ ok: false, text: "Couldn't save that decision. Try again." });
    }
    setBusy("");
  }

  return (
    <main className="page page-narrow ap">
      <p className="muted">
        {items.length
          ? `${items.length} waiting. Duplicate faces always come here; changed details come here unless the session auto-approves them.`
          : "Nothing waiting. New requests show up here and in the bell during registration."}
      </p>
      {done && (
        <p className={`notice ${done.ok ? "notice-ok" : "notice-danger"}`} role="status">
          {done.text}
        </p>
      )}

      {items.map((a) => {
        return (
          <article key={a.id} id={a.id} className="ap-card">
            <div className="ap-head">
              <span className="pill pill-warn">{a.kind === "duplicate_face" ? "Possible duplicate face" : "Changed details"}</span>
              <span className="small muted">
                {a.courseCode} · {a.submittedAt}
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
                  Check both students in person. If they are different people (twins, for example), take a photo of them together as
                  evidence. It stays on this device and is never uploaded.
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
                  <button
                    className="btn btn-outline btn-reject"
                    disabled={busy === a.id}
                    onClick={() => decide(a.id, false, `${a.student}'s registration rejected.`)}
                  >
                    Reject registration
                  </button>
                  <button
                    className="btn btn-ink"
                    disabled={!evidence[a.id] || busy === a.id}
                    onClick={() => decide(a.id, true, `${a.student} approved as a different person.`)}
                  >
                    Approve as different people
                  </button>
                </div>
              </>
            ) : (
              <>
                <Person name={a.student} indexNo={a.indexNo} note={a.unlisted ? "not on the roster" : "changed roster details"} />
                <dl className="ap-changes">
                  {a.changes.map((c) => (
                    <div key={c.field}>
                      <dt>{c.field}</dt>
                      <dd>
                        {c.from ? <s>{c.from}</s> : <span className="muted">Not on roster</span>}
                        <svg viewBox="0 0 24 24" aria-label="changed to">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                        <strong>{c.to}</strong>
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="ap-actions">
                  <button
                    className="btn btn-outline btn-reject"
                    disabled={busy === a.id}
                    onClick={() =>
                      decide(a.id, false, a.unlisted ? `${a.student}'s registration rejected.` : `${a.student}'s changes rejected. Roster details kept.`)
                    }
                  >
                    {a.unlisted ? "Reject registration" : "Keep roster details"}
                  </button>
                  <button className="btn btn-ink" disabled={busy === a.id} onClick={() => decide(a.id, true, `${a.student}'s ${a.unlisted ? "details" : "changes"} approved.`)}>
                    {a.unlisted ? "Approve details" : "Approve changes"}
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
