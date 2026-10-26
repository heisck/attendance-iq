"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotatingQr } from "@/components/RotatingQr";
import { startSession, stopSession } from "@/lib/actions";
import type { Node, Session } from "@/lib/db";
import { AUTO_CLOSE_MS } from "@/lib/time";
import { Ring } from "../../SessionRow";

const POLL_MS = 3000;
const SUSPICIOUS_MARKS = 4; // ponytail: fixed threshold, make it relative to class size if it misfires
// Phone ids are long enough never to collide; four characters are enough to tell them apart on screen.
const short = (id: string) => id.slice(0, 4);

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

type Live = Pick<Session, "status" | "startedAt" | "done" | "total"> & { nodes: Node[] };

export function LiveSession({ session, nodes }: { session: Session; nodes: Node[] }) {
  const [live, setLive] = useState<Live>({ ...session, nodes });
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stage = useRef<HTMLElement>(null);
  const running = live.status === "live";
  const reg = session.kind === "registration";
  const link = `/s/${session.id}`;
  const byMarked = [...live.nodes].sort((a, b) => b.marked - a.marked);
  const closesIn = reg ? session.closesAt - now : Math.min((live.startedAt ?? now) + AUTO_CLOSE_MS, session.closesAt) - now;

  const poll = useCallback(async () => {
    const r = await fetch(`/api/lecturer/sessions/${session.id}/live`).catch(() => null);
    if (r?.ok) setLive(await r.json());
  }, [session.id]);

  // While live: the clock ticks every second, counts and phones refresh every few seconds.
  useEffect(() => {
    if (!running) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const counts = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(clock);
      clearInterval(counts);
    };
  }, [running, poll]);

  async function toggle(start: boolean) {
    setBusy(true);
    setError("");
    try {
      const s = await (start ? startSession : stopSession)(session.id);
      if (s) setLive((l) => ({ ...l, status: s.status, startedAt: s.startedAt }));
      if (start && s?.status !== "live") setError("This session's time window has passed, so it can't open again.");
      setNow(Date.now());
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(window.location.origin + link);
    setCopied(true);
  }

  return (
    <main className="page ls">
      <div className="ls-head">
        <div>
          <p className="muted">
            {session.code} · {session.courseName}
          </p>
          <h1 className="ls-title">
            Week {session.week} {reg ? "registration" : "attendance"}
          </h1>
        </div>
        {/* Idle, the stage carries the Start button. */}
        {running && (
          <div className="ls-status">
            <span className="pill pill-live" suppressHydrationWarning>
              Live · {fmt(now - (live.startedAt ?? session.opensAt))}
            </span>
            <button className="btn btn-outline" onClick={() => toggle(false)} disabled={busy}>
              Stop session
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      )}

      <div className="ls-grid">
        {/* The stage is what gets projected: full screen keeps only the QR and its timer. */}
        <section className="live-card ls-stage" ref={stage} aria-label="QR code">
          {/* While live, the finder hops and turns once a second: the QR's timer. */}
          <span className="live-finder" data-turning={(running && !reg) || undefined} aria-hidden="true" />
          {running ? (
            <>
              <p className="live-meta ls-meta" suppressHydrationWarning>
                {reg ? `Scan to open the registration form · closes in ${fmt(closesIn)}` : `New code every second · auto-closes in ${fmt(closesIn)}`}
              </p>
              <div className="ls-qr">
                {reg ? (
                  <RotatingQr value={`${typeof window === "undefined" ? "" : window.location.origin}${link}`} />
                ) : (
                  <RotatingQr src={`/api/s/${session.id}/qr`} onClosed={poll} />
                )}
              </div>
            </>
          ) : (
            <div className="ls-idle">
              <p>{live.status === "closed" ? "This session is closed." : "The QR code shows here once the session starts."}</p>
              <button className="btn btn-light" onClick={() => toggle(true)} disabled={busy}>
                {live.status === "closed" ? "Start again" : "Start session"}
              </button>
            </div>
          )}
          <div className="ls-tools">
            <p className="ls-link">
              Students open <span className="mono">{link}</span>
              {reg ? "." : ", then scan."}
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
              <Ring pct={live.total ? (live.done / live.total) * 100 : 0} />
              <p className="turnout-pct" aria-live="polite">
                {live.done}
                <span className="ls-of">/{live.total}</span>
              </p>
            </div>
            <p className="small muted turnout-note">Compare with the number of people in the room.</p>
          </section>

          {!reg && (
            <section className="dash-section" aria-labelledby="phones-h">
              <h2 id="phones-h">Phones</h2>
              <p className="small muted">Every phone that marked someone. Many people on one phone is worth a look.</p>
              {byMarked.length === 0 && <p className="small muted">No phones yet. They appear as students mark.</p>}
              <ul className="ls-phones">
                {byMarked.map((n) => (
                  <li key={n.id} className="ls-phone" data-flag={n.marked >= SUSPICIOUS_MARKS || undefined}>
                    <span className="ls-tab mono" title={n.id}>
                      {short(n.id)}
                    </span>
                    <span className="mini-main">
                      <strong>
                        {n.marked} {n.marked === 1 ? "person" : "people"}
                      </strong>
                      <span>
                        Scanned from {n.from === "lecturer" ? "your screen" : <span className="mono">{short(n.from)}</span>}
                      </span>
                    </span>
                    {n.marked >= SUSPICIOUS_MARKS && <span className="pill pill-warn">Check</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link href={`/lecturer/courses/${session.courseId}`} className="btn btn-ink">
            View results
          </Link>
        </aside>
      </div>
    </main>
  );
}
