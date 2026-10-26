"use client";

import { useCallback, useState } from "react";
import { Camera } from "@/components/Camera";
import { FaceCheck } from "@/components/FaceCheck";
import { PhoneHead, PhoneState } from "@/components/Phone";
import { PillField } from "@/components/PillField";
import { RotatingQr } from "@/components/RotatingQr";

type Step = "scan" | "index" | "face" | "done" | "node";
const PROGRESS: Step[] = ["scan", "index", "face", "done"];

// `outcome` is a mock switch for reviewing error screens: expired | nomatch | already
export function Attend({ title, sessionId, outcome }: { title: string; sessionId: string; outcome?: string }) {
  const [step, setStep] = useState<Step>("scan");
  const [indexNo, setIndexNo] = useState("");
  const [error, setError] = useState("");
  const [marked, setMarked] = useState(0);
  const [nodeId] = useState(() => Math.random().toString(16).slice(2, 6).toUpperCase());

  const faceDone = useCallback(() => {
    if (outcome === "nomatch") {
      setError("Your face didn't match index number " + indexNo + ". Check the number and try again.");
      setStep("index");
      return;
    }
    if (outcome === "already") {
      setError("Index number " + indexNo + " is already marked present for this class.");
      setStep("index");
      return;
    }
    setMarked((m) => m + 1);
    setStep("done");
  }, [outcome, indexNo]);

  function scanned() {
    if (outcome === "expired" && !error) {
      setError("That code expired. Hold steady and scan again.");
      return;
    }
    setError("");
    setStep("index");
  }

  function nextPerson() {
    setIndexNo("");
    setError("");
    setStep("index");
  }

  return (
    <main className="phone">
      <PhoneHead title={title} steps={step === "node" ? undefined : PROGRESS.length} at={PROGRESS.indexOf(step)}>
        {marked > 0 && <span className="pill pill-ink">{marked} marked</span>}
      </PhoneHead>

      {step === "scan" && (
        <>
          <div className="phone-body">
            <h1>Scan the class QR code</h1>
            <Camera facing="environment">
              <div className="frame-qr" />
            </Camera>
            <p className="muted">Point at the code on your lecturer&apos;s screen or a classmate&apos;s phone.</p>
            {error && <p className="notice notice-danger" role="alert">{error}</p>}
          </div>
          <div className="phone-foot">
            {/* Mock only: real scanning happens automatically from the camera. */}
            <button className="btn btn-ink btn-block" onClick={scanned}>
              Simulate scan (mock)
            </button>
          </div>
        </>
      )}

      {step === "index" && (
        <form
          style={{ display: "contents" }}
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            setStep("face");
          }}
        >
          <div className="phone-body">
            <p className="notice notice-ok">Code accepted. You have 2 minutes to finish.</p>
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
            {error && <p className="notice notice-danger" role="alert">{error}</p>}
          </div>
          <div className="phone-foot">
            <button className="btn btn-ink btn-block" disabled={indexNo.length < 4}>
              Continue to face check
            </button>
          </div>
        </form>
      )}

      {step === "face" && <FaceCheck onDone={faceDone} />}

      {step === "done" && (
        <>
          <PhoneState icon="check" title="Marked present">
            <p className="muted">
              Index <span className="mono">{indexNo}</span> ·{" "}
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="notice">Keep this tab open to help classmates. Refreshing or closing it ends that.</p>
          </PhoneState>
          <div className="phone-foot">
            <button className="btn btn-ink btn-block" onClick={() => setStep("node")}>
              Show QR for a classmate
            </button>
            <button className="btn btn-outline btn-block" onClick={nextPerson}>
              Mark someone on this phone
            </button>
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
                <RotatingQr sessionId={sessionId} nodeId={nodeId} />
              </div>
            </section>
            <p className="muted small">Keep this tab open; refreshing or closing it stops the code.</p>
          </div>
          <div className="phone-foot">
            <button className="btn btn-ink btn-block" onClick={nextPerson}>
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
