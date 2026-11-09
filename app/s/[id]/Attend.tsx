"use client";

import { useRef, useState } from "react";
import { FaceCheck, type Capture } from "@/components/FaceCheck";
import { PhoneHead, PhoneState } from "@/components/Phone";
import { PillField } from "@/components/PillField";
import { QrScanner } from "@/components/QrScanner";
import { RotatingQr, type QrSource } from "@/components/RotatingQr";
import { post } from "@/lib/post";
import type { Challenge } from "@/lib/challenge";

type Step = "scan" | "index" | "face" | "done" | "node" | "closed";
// The index step only shows when the server couldn't tell who the face is (it counts as part of "face").
const PROGRESS: Step[] = ["scan", "face", "done"];
type Ticket = { ticket: string; challenge: Challenge };


export function Attend({ title, sessionId }: { title: string; sessionId: string }) {
  const [step, setStep] = useState<Step>("scan");
  const [indexNo, setIndexNo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState(0);
  const [markedAt, setMarkedAt] = useState(0);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  // A new key re-films after a failed check. The last capture is kept for the index-number fallback.
  const [attempt, setAttempt] = useState(0);
  const [matchedIndex, setMatchedIndex] = useState("");
  const capture = useRef<Capture | null>(null);
  // Set after the first mark: lets this tab show codes, and keeps it one phone in the lecturer's list.
  // Every person marked here still scans a live code first (that's what shows they're in the room).
  const [node, setNode] = useState("");
  const [qr, setQr] = useState<QrSource | null>(null);
  const company = useRef("");

  async function getTicket(code: string) {
    setBusy(true);
    const r = await post(`/api/s/${sessionId}/ticket`, { code, node: node || undefined });
    setBusy(false);
    if (r.status === 410) return setStep("closed");
    if (!r.ok) return setError(r.error);
    setTicket(r.data);
    setError("");
    setStep("face");
  }

  const scanned = (code: string) => {
    if (busy) return;
    if (code.startsWith(`${sessionId}.`)) return getTicket(code);
    // An attendance code (session.node.time.signature) for another session: say so, rather than seem stuck.
    // Anything else (a URL, a product barcode) is ignored.
    if (/^\w{10}\.[^.]+\.\d+\.[\w-]+$/.test(code)) setError("That QR code is for a different class session. Scan the one for this class.");
  };

  // No index number first: the server matches the face against the course. indexNo only after it asked.
  async function submit(withIndex?: string) {
    setBusy(true);
    const r = await post(`/api/s/${sessionId}/attend`, { ticket: ticket!.ticket, indexNo: withIndex, ...capture.current!, company: company.current });
    setBusy(false);
    if (r.ok) {
      setMatchedIndex(r.data.indexNo);
      // The phone's clock may be off; codes must carry the server's time, so keep the difference.
      setQr({ ...r.data.qr, sessionId, offset: r.data.markedAt - Date.now() });
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
    // Couldn't tell who it was, or the typed number didn't fit: (re)type the number, same capture.
    if (r.data.needIndex || (withIndex && (r.status === 404 || r.status === 422))) return setStep("index");
    // The face check itself failed (or the student can't be marked): film again.
    setAttempt((a) => a + 1);
    setStep("face");
  }

  function faceDone(c: Capture) {
    capture.current = c;
    submit();
  }

  // The next person on this phone starts by scanning a live code, like everyone else.
  function nextPerson() {
    setIndexNo("");
    capture.current = null;
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
      <PhoneHead title={title} steps={step === "node" ? undefined : PROGRESS.length} at={PROGRESS.indexOf(step === "index" ? "face" : step)}>
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
            submit(indexNo);
          }}
        >
          <div className="phone-body">
            <h1>Your index number</h1>
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
            <p className="hint">Your face check passed, but looked close to a classmate&apos;s. Your number settles it; no need to film again.</p>
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
            <button className="btn btn-ink btn-block" disabled={indexNo.length < 4 || busy}>
              {busy ? "Checking…" : "Finish with this number"}
            </button>
          </div>
        </form>
      )}

      {step === "face" && ticket && <FaceCheck key={attempt} challenge={ticket.challenge} onFrames={faceDone} error={error} />}

      {step === "done" && (
        <>
          <PhoneState icon="check" title="Marked present">
            <p className="muted">
              Index <span className="mono">{matchedIndex}</span> · {new Date(markedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                {qr && <RotatingQr source={qr} onClosed={() => setStep("closed")} />}
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
