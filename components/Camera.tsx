"use client";

import { useEffect, useRef, useState } from "react";

export function Camera({
  facing,
  children,
}: {
  facing: "user" | "environment";
  children?: React.ReactNode;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing }, audio: false })
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
  }, [facing]);

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
