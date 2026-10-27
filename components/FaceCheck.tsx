"use client";

import { useEffect, useRef, useState } from "react";
import type { Step } from "@/lib/schemas";
import { Camera } from "./Camera";

// The server picks the moves; this films them, then hands everything back for the server to judge:
// - track: a small snapshot every TRACK_MS for the whole check, so the server can see the face never
//   leaves or jumps (photos swapped in front of the camera do both);
// - frames: two sharper frames late in each move, each taken from the same picture as one snapshot (marks).
// Pictures are raw camera pixels (the preview is mirrored, they aren't).
const LABEL: Record<Step, string> = {
  center: "Look straight at the camera",
  left: "Turn your head left",
  right: "Turn your head right",
  up: "Look up",
};
const TRACK_MS = 200;
// People need ~1 s to read an instruction and move, so frames are taken late in each step.
const STEP_MS = 2200;
const CAPTURE_AT = [1200, 1800]; // ms into each step, multiples of TRACK_MS
const WIDTH = 300;
const HEIGHT = 400; // 3:4, like the .camera preview
const QUALITY = 0.75;
const TRACK_WIDTH = 120;
const TRACK_QUALITY = 0.6;

export type Capture = { frames: string[]; track: string[]; marks: number[] };

// Draws what the preview shows: its 3:4 centre (object-fit: cover). Sending the whole frame shrank a
// face that fills the oval on a 16:9 webcam below the face service's MIN_FACE.
function centre(v: HTMLVideoElement) {
  const sw = Math.min(v.videoWidth, (v.videoHeight * WIDTH) / HEIGHT);
  const sh = Math.min(v.videoHeight, (v.videoWidth * HEIGHT) / WIDTH);
  const c = document.createElement("canvas");
  c.width = WIDTH;
  c.height = HEIGHT;
  c.getContext("2d")!.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, WIDTH, HEIGHT);
  return c;
}

function jpeg(c: HTMLCanvasElement, width: number, quality: number) {
  let out = c;
  if (width !== c.width) {
    out = document.createElement("canvas");
    out.width = width;
    out.height = Math.round((width * c.height) / c.width);
    out.getContext("2d")!.drawImage(c, 0, 0, out.width, out.height);
  }
  return out.toDataURL("image/jpeg", quality).split(",")[1];
}

export function FaceCheck({ challenge, onFrames }: { challenge: Step[]; onFrames: (capture: Capture) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState(-1); // -1 = not started, challenge.length = checking
  const [notReady, setNotReady] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  // Held in a ref so a parent re-render can't restart the capture.
  const done = useRef(onFrames);
  useEffect(() => {
    done.current = onFrames;
  }, [onFrames]);
  useEffect(() => () => clearInterval(timer.current), []);

  function start() {
    if (!video.current || video.current.readyState < 2) return setNotReady(true);
    setNotReady(false);
    const capture: Capture = { frames: [], track: [], marks: [] };
    const ticks = (challenge.length * STEP_MS) / TRACK_MS;
    let n = 0;
    const tick = () => {
      if (n === ticks) {
        clearInterval(timer.current);
        setStep(challenge.length);
        return done.current(capture);
      }
      const t = n * TRACK_MS;
      const picture = centre(video.current!);
      capture.track.push(jpeg(picture, TRACK_WIDTH, TRACK_QUALITY));
      if (CAPTURE_AT.includes(t % STEP_MS)) {
        capture.marks.push(n);
        capture.frames.push(jpeg(picture, WIDTH, QUALITY));
      }
      setStep(Math.floor(t / STEP_MS));
      n++;
    };
    tick();
    timer.current = setInterval(tick, TRACK_MS);
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
          <li>Keep your face in the oval the whole time and turn smoothly, following the arrow.</li>
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
