"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, FLASH_MS, type Challenge } from "@/lib/challenge";
import { loadYunet, look } from "@/lib/yunet";
import { Camera } from "./Camera";

// Films the check the server asked for (face/app.py has the full story), then hands it all back to judge:
// 1. far: about a second in the small oval, the screen white (a ring light in a dim room);
// 2. flash: the ticket's colours fill the screen while the student brings the phone closer, into the
//    ticket's oval. The last colour is white; the close frames are taken in it.
// track: a small snapshot every TRACK_MS throughout, times: each one's ms from the flash start;
// frames: sharp pictures, each taken from the same picture as a snapshot (marks).
// Pictures are raw camera pixels (the preview is mirrored, they aren't). YuNet on the phone only gives hints.
const FAR_OVAL = { x: 0.5, y: 0.46, w: 0.38 };
const FAR_MS = 1000;
const TRACK_MS = 100;
const FAR_AT = [-600, -200]; // ms from the flash start
const WIDTH = 300;
const HEIGHT = 400; // 3:4, like the .camera preview
const QUALITY = 0.75;
const TRACK_WIDTH = 160;
const TRACK_QUALITY = 0.6;
const DARK = 45; // mean brightness under which the hint asks for light

export type Capture = { frames: string[]; track: string[]; marks: number[]; times: number[] };
type Oval = Challenge["oval"];
type Stage = "align" | "far" | "flash" | "checking";

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

const rgb = (i: number) => `rgb(${COLORS[i].join(" ")})`;

// What to tell the student about where their face is against the oval they should fill, or "" if it fits.
// fit is YuNet's box width over the oval's: ~0.7 when the face looks like it fills it (measured on real
// checks; the box is narrower than a face looks). Far: no bigger than the small oval, so there's room to come
// closer. Close: about filling the big one, so the face grows by the face service's CLOSER (1.35x) even in
// the worst case (0.65 x 0.66 / (0.8 x 0.38) = 1.41); a face filling both grows ~1.9x.
const FIT = { far: [0.5, 0.8], close: [0.65, 1.3] } as const;
function advise(seen: Awaited<ReturnType<typeof look>>, oval: Oval, [min, max]: readonly [number, number]) {
  if (!seen) return "";
  if (!seen.face) return seen.light < DARK ? "Too dark. Face a light or a window." : "Fit your face in the oval";
  const { x, y, w, h } = seen.face;
  const fit = w / oval.w;
  if (fit < min) return "Move closer";
  if (fit > max) return "Move back a little";
  // The preview is mirrored: the face's x flips.
  if (Math.abs(1 - (x + w / 2) - oval.x) > 0.1 || Math.abs(y + h / 2 - oval.y) > 0.1) return "Centre your face in the oval";
  return seen.light < DARK ? "Too dark. Face a light or a window." : "";
}

export function FaceCheck({ challenge, onFrames, error }: { challenge: Challenge; onFrames: (capture: Capture) => void; error?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  // Holds --flash, the screen colour, for the light and the oval's mask alike.
  const body = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("align");
  const [hint, setHint] = useState("");
  // YuNet on this phone: loading, running ("on"), or unavailable / too slow to load ("off": no gating).
  const [guide, setGuide] = useState<"loading" | "on" | "off">("loading");
  const [notReady, setNotReady] = useState(false);
  const [lost, setLost] = useState(false); // the last check stopped because the face left the oval
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; frame?: number; run: number }>({ run: 0 });
  // Held in refs so a parent re-render can't restart the capture, and the hint loop sees the live stage.
  const done = useRef(onFrames);
  const stageRef = useRef(stage);
  useEffect(() => {
    done.current = onFrames;
    stageRef.current = stage;
  }, [onFrames, stage]);

  // Stops a running check without sending it, back to the start.
  function abort() {
    timers.current.run++;
    clearInterval(timers.current.tick);
    cancelAnimationFrame(timers.current.frame ?? 0);
    setLost(true);
    setStage("align");
  }

  // Hints: YuNet on the live preview, a few times a second, against whichever oval is showing. While a
  // check runs, a face missing from 3 looks in a row (~1 s) stops it: nothing is sent, no face service time
  // is spent, and a phone held up to the camera has to stay perfectly framed throughout.
  useEffect(() => {
    let stop = false;
    let misses = 0;
    // A phone that can't load it within 8 s (slow data, old browser) checks without gating, as before.
    const slow = setTimeout(() => setGuide((g) => (g === "loading" ? "off" : g)), 8000);
    loadYunet().then((y) => !y && setGuide("off"));
    (async () => {
      while (!stop) {
        const s = stageRef.current;
        if (s === "checking") break;
        const seen = video.current ? await look(video.current) : null;
        if (stop) break;
        if (seen) setGuide("on");
        setHint(s === "flash" ? advise(seen, challenge.oval, FIT.close) : advise(seen, FAR_OVAL, FIT.far));
        misses = seen && !seen.face && (s === "far" || s === "flash") ? misses + 1 : 0;
        if (misses >= 3) {
          misses = 0;
          abort();
        }
        await new Promise((r) => setTimeout(r, s === "align" ? 250 : 300));
      }
    })();
    return () => {
      stop = true;
      clearTimeout(slow);
    };
  }, [challenge.oval]);


  useEffect(() => {
    const t = timers.current;
    return () => {
      clearInterval(t.tick);
      cancelAnimationFrame(t.frame ?? 0);
    };
  }, []);

  function start() {
    if (!video.current || video.current.readyState < 2) return setNotReady(true);
    setNotReady(false);
    setLost(false);
    setStage("far");
    const run = ++timers.current.run; // abort() bumps it: this check's ticks and paints then stop
    const capture: Capture = { frames: [], track: [], marks: [], times: [] };
    const flashAt = performance.now() + FAR_MS;
    const end = challenge.colors.length * FLASH_MS;
    // The close frames: in the last colour (white), late enough for the camera to have caught up with it.
    const closeAt = [end - 200, end - 100];
    const ticks = (FAR_MS + end) / TRACK_MS;

    // The screen colour, from the clock on every animation frame (not the 100 ms ticks), so each change
    // lands within a frame of when the server expects it.
    const paint = () => {
      if (run !== timers.current.run) return;
      const t = performance.now() - flashAt;
      const i = t < 0 ? 0 : challenge.colors[Math.min(Math.floor(t / FLASH_MS), challenge.colors.length - 1)];
      body.current?.style.setProperty("--flash", rgb(i));
      if (t >= 0 && stageRef.current === "far") setStage("flash");
      if (t < end) timers.current.frame = requestAnimationFrame(paint);
    };
    paint();

    let n = 0;
    const tick = () => {
      if (run !== timers.current.run) return;
      if (n === ticks) {
        clearInterval(timers.current.tick);
        setStage("checking");
        return done.current(capture);
      }
      const nominal = n++ * TRACK_MS - FAR_MS;
      const picture = centre(video.current!);
      capture.track.push(jpeg(picture, TRACK_WIDTH, TRACK_QUALITY));
      capture.times.push(Math.round(performance.now() - flashAt));
      if (FAR_AT.includes(nominal) || closeAt.includes(nominal)) {
        capture.marks.push(capture.track.length - 1);
        capture.frames.push(jpeg(picture, WIDTH, QUALITY));
      }
    };
    tick();
    timers.current.tick = setInterval(tick, TRACK_MS);
  }

  const oval = stage === "flash" || stage === "checking" ? challenge.oval : FAR_OVAL;
  const dark = hint.startsWith("Too dark");
  // Lit while checking, and before it in a dark room: the screen's white light helps find the face.
  const lit = stage !== "align" || dark;
  const caption =
    stage === "checking"
      ? "Checking…"
      : stage === "flash"
        ? hint || (guide === "on" ? "Hold still" : "Bring the phone closer to fill the oval")
        : stage === "far"
          ? "Hold still…"
          : hint || "Fit your face in the oval";
  // Before starting, the button waits for YuNet and then for a face in the oval: no check starts on an empty
  // oval, so none reaches the face service. Where YuNet can't run, it doesn't wait.
  const blocked = stage === "align" && (guide === "loading" || (guide === "on" && hint !== ""));

  return (
    <>
      {/* --ox, --oy, --ow: the oval, for its outline and for clipping the video to it while lit. */}
      <div className="phone-body" ref={body} style={{ "--ox": oval.x, "--oy": oval.y, "--ow": oval.w } as React.CSSProperties}>
        {lit && <div className="face-light" aria-hidden="true" />}
        <Camera facing="user" video={video} lit={lit}>
          <div className="frame-face" data-state={stage === "checking" ? "ok" : undefined} />
          <p className="camera-caption" aria-live="polite">
            {caption}
          </p>
        </Camera>
        {error && (
          <p className="notice notice-danger" role="alert">
            {error}
          </p>
        )}
        <ul className="face-tips">
          <li>Turn your screen brightness up. No cap or sunglasses.</li>
          <li>Start at arm&apos;s length. The screen changes colour while you bring the phone closer.</li>
        </ul>
        {notReady && <p className="notice">The camera is still starting. Try again in a moment.</p>}
        {lost && stage === "align" && (
          <p className="notice notice-danger" role="alert">
            Face not detected, so the check stopped. Keep your face in the oval the whole time, then start again.
          </p>
        )}
      </div>
      {/* Above the light when it's on before the check (a dark room), so the button stays reachable. */}
      <div className="phone-foot" data-lit={(lit && stage === "align") || undefined}>
        <button className="btn btn-ink btn-block" disabled={stage !== "align" || blocked} onClick={start}>
          {stage !== "align"
            ? stage === "checking"
              ? "Checking…"
              : "Keep going…"
            : guide === "loading"
              ? "Getting the face guide ready…"
              : blocked
                ? hint
                : "Start face check"}
        </button>
      </div>
    </>
  );
}
