"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { Camera } from "./Camera";

const EVERY_MS = 150;
const WIDTH = 640;

// Reads QR codes, from the back camera unless switched (the button in the corner: some phones' back camera
// won't focus close up, and a classmate's phone may be easier to scan with the front one). jsQR rather than
// BarcodeDetector: iOS Safari doesn't have the latter. Calls onCode for each new code; the same code is
// reported once.
export function QrScanner({ onCode, paused }: { onCode: (code: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const last = useRef("");
  const handler = useRef(onCode);
  useEffect(() => {
    handler.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (paused) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const id = setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2) return;
      canvas.width = Math.min(WIDTH, v.videoWidth);
      canvas.height = Math.round((canvas.width / v.videoWidth) * v.videoHeight);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const found = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
      if (found?.data && found.data !== last.current) {
        last.current = found.data;
        handler.current(found.data);
      }
    }, EVERY_MS);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <Camera facing={facing} video={video}>
      <div className="frame-qr" />
      <button
        type="button"
        className="camera-switch"
        aria-label={facing === "environment" ? "Switch to the front camera" : "Switch to the back camera"}
        onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7" />
        </svg>
      </button>
    </Camera>
  );
}
