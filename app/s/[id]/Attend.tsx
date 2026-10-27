"use client";

import { useRef, useState } from "react";
import { FaceCheck, type Capture } from "@/components/FaceCheck";
import { PhoneHead, PhoneState } from "@/components/Phone";
import { PillField } from "@/components/PillField";
import { QrScanner } from "@/components/QrScanner";
import { RotatingQr } from "@/components/RotatingQr";
import { post } from "@/lib/post";
import type { Step as Move } from "@/lib/schemas";

type Step = "scan" | "index" | "face" | "done" | "node" | "closed";
const PROGRESS: Step[] = ["scan", "index", "face", "done"];
type Ticket = { ticket: string; challenge: Move[] };


export function Attend({ title, sessionId }: { title: string; sessionId: string }) {
  const [step, setStep] = useState<Step>("scan");
  const [indexNo, setIndexNo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState(0);
  const [markedAt, setMarkedAt] = useState(0);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  // Set after the first mark: lets this tab show codes, and keeps it one phone in the lecturer's list.
  // Every person marked here still scans a live code first (that's what shows they're in the room).
  const [node, setNode] = useState("");
  const company = useRef("");

  async function getTicket(code: string) {
    setBusy(true);
    const r = await post(`/api/s/${sessionId}/ticket`, { code, node: node || undefined });
    setBusy(false);
    if (r.status === 410) return setStep("closed");
    if (!r.ok) return setError(r.error);
    setTicket(r.data);
    setError("");
    setStep("index");
  }

  const scanned = (code: string) => {
    // Only codes for this session; anything else (a URL, another class) is ignored.
    if (!busy && code.startsWith(`${sessionId}.`)) getTicket(code);
  };

  async function faceDone(capture: Capture) {
    const r = await post(`/api/s/${sessionId}/attend`, { ticket: ticket!.ticket, indexNo, ...capture, company: company.current });
    if (r.ok) {
      setNode(r.data.node ?? node);
      setMarkedAt(r.data.markedAt ?? Date.now());
      setMarked((m) => m + 1);
      setError("");
      return setStep("done");
    }
    setError(r.error);
    if (r.status === 410) return setStep("closed");
    if (r.data.rescan) {
      setTicket(null);
      return setStep("scan");
    }
    setStep("index");
  }

  // The next person on this phone starts by scanning a live code, like everyone else.
  function nextPerson() {
    setIndexNo("");
    setTicket(null);
    setError("");
    setStep("scan");
  }

  if (step === "closed")
    return (
      <main className="phone">
        <PhoneHead title={title} />
        <PhoneState icon="lock" title="This session has closed">
          {marked > 0 && <p className="muted">{marked === 1 ? "1 person was" : `${marked} people were`} marked on this phone.</p>}
          <p className="muted">Ask your lecturer if you think you should have been marked.</p>
        </PhoneState>
      </main>
    );

  return (
    <main className="phone">
      <PhoneHead title={title} steps={step === "node" ? undefined : PROGRESS.length} at={PROGRESS.indexOf(step)}>
        {marked > 0 && <span className="pill pill-ink">{marked} marked</span>}
      </PhoneHead>

      {step === "scan" && (
        <div className="phone-body">
          <h1>{marked > 0 ? "Next person: scan the class QR code" : "Scan the class QR code"}</h1>
          <QrScanner onCode={scanned} paused={busy} />
          <p className="muted">{busy ? "Checking the code…" : "Point at the code on your lecturer's screen or a classmate's phone."}</p>
          {error && (
            <p className="notice notice-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {step === "index" && (
        <form
          style={{ display: "contents" }}
          onSubmit={(e) => {
            e.preventDefault();
            company.current = String(new FormData(e.currentTarget).get("company") ?? "");
            setError("");
            setStep("face");
          }}
        >
          <div className="phone-body">
            {!error && <p className="notice notice-ok">Code accepted. You have 2 minutes to finish.</p>}
            <h1>{marked > 0 ? "Next person" : "Your index number"}</h1>
            <PillField
              id="index"
              label="Index number"
              inputMode="numeric"
              autoComplete="off"
              placeholder=" "
              required
              value={indexNo}
              onChange={(e) => setIndexNo(e.target.value.replace(/\D/g, ""))}
              icon={<path d="M9 4 7 20M17 4l-2 16M4.5 9h15M4 15h15" />}
            />
            <p className="hint">The face check compares you against this student&apos;s registered face.</p>
            <div className="honeypot" aria-hidden="true">
              <label htmlFor="company">Company</label>
              <input id="company" name="company" tabIndex={-1} autoComplete="off" />
            </div>
            {error && (
              <p className="notice notice-danger" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="phone-foot">
            <button className="btn btn-ink btn-block" disabled={indexNo.length < 4}>
              Continue to face check
            </button>
          </div>
        </form>
      )}

      {step === "face" && ticket && <FaceCheck challenge={ticket.challenge} onFrames={faceDone} />}

      {step === "done" && (
        <>
          <PhoneState icon="check" title="Marked present">
            <p className="muted">
              Index <span className="mono">{indexNo}</span> · {new Date(markedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="notice">Keep this tab open to help classmates. Refreshing or closing it ends that.</p>
          </PhoneState>
          <div className="phone-foot">
            <button className="btn btn-ink btn-block" onClick={() => setStep("node")}>
              Show QR for a classmate
            </button>
            <button className="btn btn-outline btn-block" onClick={nextPerson} disabled={busy}>
              Mark someone on this phone
            </button>
            {error && (
              <p className="notice notice-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </>
      )}

      {step === "node" && (
        <>
          <div className="phone-body">
            <h1>Let a classmate scan this</h1>
            {/* Same stage as the lecturer's screen: the corner finder turns with each new code. */}
            <section className="live-card ls-stage" aria-label="QR code">
              <span className="live-finder" data-turning aria-hidden="true" />
              <p className="live-meta ls-meta">New code every second</p>
              <div className="ls-qr">
                <RotatingQr src={`/api/s/${sessionId}/qr?node=${encodeURIComponent(node)}`} onClosed={() => setStep("closed")} />
              </div>
            </section>
            <p className="muted small">Keep this tab open; refreshing or closing it stops the code.</p>
          </div>
          <div className="phone-foot">
            <button className="btn btn-ink btn-block" onClick={nextPerson} disabled={busy}>
              Mark someone on this phone
            </button>
            <button className="btn btn-outline btn-block" onClick={() => setStep("done")}>
              Hide QR
            </button>
          </div>
        </>
      )}
    </main>
  );
}
