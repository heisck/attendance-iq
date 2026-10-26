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
const STEP_MS = 1600;
const CAPTURE_AT = [800, 1400]; // ms into each step, one per frame
const WIDTH = 360;
const QUALITY = 0.75;

function grab(v: HTMLVideoElement) {
  const c = document.createElement("canvas");
  c.width = WIDTH;
  c.height = Math.round((WIDTH / v.videoWidth) * v.videoHeight);
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
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

  return (
    <>
      <div className="phone-body">
        <Camera facing="user" video={video}>
          <div className="frame-face" data-state={step >= challenge.length ? "ok" : undefined} />
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
