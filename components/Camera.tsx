"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// `video`: pass a ref to read frames from the stream (QR scanning, face capture).
export function Camera({
  facing,
  children,
  video: external,
}: {
  facing: "user" | "environment";
  children?: React.ReactNode;
  video?: RefObject<HTMLVideoElement | null>;
}) {
  const own = useRef<HTMLVideoElement>(null);
  const video = external ?? own;
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("Camera blocked. Allow camera access in your browser settings, then reload."));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, video]);

  return (
    <div className={`camera ${facing === "user" ? "camera-mirror" : ""}`}>
      <video ref={video} autoPlay playsInline muted />
      {error && (
        <div className="camera-empty">
          <p>{error}</p>
        </div>
      )}
      {children}
    </div>
  );
}
