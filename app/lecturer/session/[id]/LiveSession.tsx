"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RotatingQr } from "@/components/RotatingQr";
import type { Course, Node, Session } from "@/mocks/data";
import { Ring } from "../../SessionRow";

const AUTO_CLOSE_S = 30 * 60;
const SUSPICIOUS_MARKS = 4; // ponytail: fixed threshold, make it relative to class size if it misfires

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function LiveSession({ session, course, total, nodes }: { session: Session; course: Course; total: number; nodes: Node[] }) {
  const [running, setRunning] = useState(session.status === "live");
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const marked = nodes.reduce((n, x) => n + x.marked, 0);
  const byMarked = [...nodes].sort((a, b) => b.marked - a.marked);
  const link = `/s/${session.id}`;
  const reg = session.kind === "registration";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  async function copy() {
    await navigator.clipboard.writeText(window.location.origin + link);
    setCopied(true);
  }

  return (
    <main className="page ls">
      <div className="ls-head">
        <div>
          <p className="muted">
            {course.code} · {course.name}
          </p>
          <h1 className="ls-title">
            Week {session.week} {reg ? "registration" : "attendance"}
          </h1>
        </div>
        {/* Idle, the stage carries the Start button. */}
        {running && (
          <div className="ls-status">
            <span className="pill pill-live">Live · {fmt(elapsed)}</span>
            <button className="btn btn-outline" onClick={() => setRunning(false)}>
              Stop session
            </button>
          </div>
        )}
      </div>

      <div className="ls-grid">
        {/* The stage is what gets projected: full screen keeps only the QR and its timer. */}
        <section className="live-card ls-stage" ref={stage} aria-label="QR code">
          {/* While live, the finder hops and turns once a second: the QR's timer. */}
          <span className="live-finder" data-turning={running || undefined} aria-hidden="true" />
          {running ? (
            <>
              <p className="live-meta ls-meta">
                New code every second · auto-closes in {fmt(Math.max(0, AUTO_CLOSE_S - elapsed))}
              </p>
              <div className="ls-qr">
                <RotatingQr sessionId={session.id} nodeId="lecturer" />
              </div>
            </>
          ) : (
            <div className="ls-idle">
              <p>The QR code shows here once the session starts.</p>
              <button className="btn btn-light" onClick={() => setRunning(true)}>
                Start session
              </button>
            </div>
          )}
          <div className="ls-tools">
            <p className="ls-link">
              Students open <span className="mono">{link}</span>, then scan.
            </p>
            <div className="row">
              <button className="btn btn-light" onClick={copy}>
                {copied ? "Copied" : "Copy student link"}
              </button>
              <button className="btn btn-outline-light" onClick={() => stage.current?.requestFullscreen()} disabled={!running}>
                Project full screen
              </button>
            </div>
          </div>
        </section>

        <aside className="dash-aside ls-side">
          <section className="dash-section" aria-labelledby="count-h">
            <h2 id="count-h">{reg ? "Registered" : "Marked present"}</h2>
            <div className="turnout">
              <Ring pct={total ? (marked / total) * 100 : 0} />
              <p className="turnout-pct" aria-live="polite">
                {marked}
                <span className="ls-of">/{total}</span>
              </p>
            </div>
            <p className="small muted turnout-note">Compare with the number of people in the room.</p>
          </section>

          <section className="dash-section" aria-labelledby="phones-h">
            <h2 id="phones-h">Phones</h2>
            <p className="small muted">Every phone that marked someone. Many people on one phone is worth a look.</p>
            {byMarked.length === 0 && <p className="small muted">No phones yet. They appear as students mark.</p>}
            <ul className="ls-phones">
              {byMarked.map((n) => (
                <li key={n.id} className="ls-phone" data-flag={n.marked >= SUSPICIOUS_MARKS || undefined}>
                  <span className="ls-tab mono">{n.id}</span>
                  <span className="mini-main">
                    <strong>
                      {n.marked} {n.marked === 1 ? "person" : "people"}
                    </strong>
                    <span>
                      Scanned from <span className={n.from === "Your screen" ? "" : "mono"}>{n.from}</span>
                    </span>
                  </span>
                  {n.marked >= SUSPICIOUS_MARKS && <span className="pill pill-warn">Check</span>}
                </li>
              ))}
            </ul>
          </section>

          <Link href={`/lecturer/courses/${course.id}`} className="btn btn-ink">
            View results
          </Link>
        </aside>
      </div>
    </main>
  );
}
