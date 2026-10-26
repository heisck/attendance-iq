"use client";

import { useEffect, useState } from "react";
import { Camera } from "./Camera";

// Mock: the server will pick the challenge and judge the frames. Here steps auto-advance.
const CHALLENGES = ["Turn your head left", "Turn your head right", "Blink twice", "Look up"];
const STEP_MS = 1600;

function pickChallenge() {
  const shuffled = [...CHALLENGES].sort(() => Math.random() - 0.5);
  return ["Look straight at the camera", ...shuffled.slice(0, 2)];
}

export function FaceCheck({ onDone }: { onDone: () => void }) {
  const [steps] = useState(pickChallenge);
  const [step, setStep] = useState(-1); // -1 = not started, steps.length = checking

  useEffect(() => {
    if (step < 0) return;
    const t = setTimeout(() => (step < steps.length ? setStep(step + 1) : onDone()), STEP_MS);
    return () => clearTimeout(t);
  }, [step, steps.length, onDone]);

  const caption =
    step < 0 ? "Fit your face in the oval" : step < steps.length ? steps[step] : "Checking…";

  return (
    <>
      <div className="phone-body">
        <Camera facing="user">
          <div className="frame-face" data-state={step >= steps.length ? "ok" : undefined} />
          <p className="camera-caption" aria-live="polite">
            {caption}
          </p>
        </Camera>
        <ul className="face-tips">
          <li>Good light on your face, no cap or sunglasses.</li>
          <li>Follow each instruction until it changes.</li>
        </ul>
      </div>
      <div className="phone-foot">
        <button className="btn btn-ink btn-block" disabled={step >= 0} onClick={() => setStep(0)}>
          {step < 0 ? "Start face check" : "Hold still…"}
        </button>
      </div>
    </>
  );
}
