"use client";

import { useEffect, useRef, useState } from "react";
import { FRAMES_PER_STEP, type Step } from "@/lib/schemas";
import { Camera } from "./Camera";

// The server picks the moves; this captures FRAMES_PER_STEP frames during each one, then hands them
// back for the server to judge. Frames are raw camera pixels (the preview is mirrored, they aren't).
const LABEL: Record<Step, string> = {
  center: "Look straight at the camera",
  left: "Turn your head left",
  right: "Turn your head right",
  up: "Look up",
};
// People need ~1 s to read an instruction and move, so frames are taken late in each step.
const STEP_MS = 2200;
const CAPTURE_AT = [1200, 1900]; // ms into each step, one per frame
const WIDTH = 300;
const HEIGHT = 400; // 3:4, like the .camera preview
const QUALITY = 0.75;

// Sends what the preview shows: its 3:4 centre (object-fit: cover). Sending the whole frame shrank a
// face that fills the oval on a 16:9 webcam below the face service's MIN_FACE.
function grab(v: HTMLVideoElement) {
  const sw = Math.min(v.videoWidth, (v.videoHeight * WIDTH) / HEIGHT);
  const sh = Math.min(v.videoHeight, (v.videoWidth * HEIGHT) / WIDTH);
  const c = document.createElement("canvas");
  c.width = WIDTH;
  c.height = HEIGHT;
  c.getContext("2d")!.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, WIDTH, HEIGHT);
  return c.toDataURL("image/jpeg", QUALITY).split(",")[1];
}

export function FaceCheck({ challenge, onFrames }: { challenge: Step[]; onFrames: (frames: string[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState(-1); // -1 = not started, challenge.length = checking
  const [notReady, setNotReady] = useState(false);
  const frames = useRef<string[]>([]);
  // Held in a ref so a parent re-render can't restart the capture timers.
  const done = useRef(onFrames);
  useEffect(() => {
    done.current = onFrames;
  }, [onFrames]);

  useEffect(() => {
    if (step < 0 || step >= challenge.length) return;
    const timers = CAPTURE_AT.slice(0, FRAMES_PER_STEP).map((at) => setTimeout(() => frames.current.push(grab(video.current!)), at));
    timers.push(
      setTimeout(() => {
        if (step + 1 < challenge.length) return setStep(step + 1);
        setStep(challenge.length);
        done.current(frames.current);
      }, STEP_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [step, challenge]);

  function start() {
    if (!video.current || video.current.readyState < 2) return setNotReady(true);
    frames.current = [];
    setNotReady(false);
    setStep(0);
  }

  const caption = step < 0 ? "Fit your face in the oval" : step < challenge.length ? LABEL[challenge[step]] : "Checking…";
  const move = step >= 0 && step < challenge.length && challenge[step] !== "center" ? challenge[step] : null;

  return (
    <>
      <div className="phone-body">
        <Camera facing="user" video={video}>
          <div className="frame-face" data-state={step >= challenge.length ? "ok" : undefined} />
          {/* The preview is a mirror: turning to your left moves your reflection to the screen's left. */}
          {move && (
            <span key={step} className="face-arrow" data-dir={move} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M19 12H5M11 6l-6 6 6 6" />
              </svg>
            </span>
          )}
          <p className="camera-caption" aria-live="polite">
            {caption}
          </p>
        </Camera>
        <ul className="face-tips">
          <li>Good light on your face, no cap or sunglasses.</li>
          <li>Follow each instruction until it changes.</li>
        </ul>
        {notReady && <p className="notice">The camera is still starting. Try again in a moment.</p>}
      </div>
      <div className="phone-foot">
        <button className="btn btn-ink btn-block" disabled={step >= 0} onClick={start}>
          {step < 0 ? "Start face check" : step < challenge.length ? "Hold still…" : "Checking…"}
        </button>
      </div>
    </>
  );
}
