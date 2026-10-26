"use client";

import jsQR from "jsqr";
import { useEffect, useRef } from "react";
import { Camera } from "./Camera";

const EVERY_MS = 150;
const WIDTH = 640;

// Reads QR codes from the back camera. jsQR rather than BarcodeDetector: iOS Safari doesn't have the latter.
// Calls onCode for each new code; the same code is reported once.
export function QrScanner({ onCode, paused }: { onCode: (code: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
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
    <Camera facing="environment" video={video}>
      <div className="frame-qr" />
    </Camera>
  );
}
