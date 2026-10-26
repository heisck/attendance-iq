"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

// Mock: makes a random token every second. Real tokens will come from the server (signed, server time inside).
export function RotatingQr({ sessionId, nodeId }: { sessionId: string; nodeId: string }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    const draw = () => {
      const token = `${sessionId}.${nodeId}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
      QRCode.toString(token, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(setSvg);
    };
    draw();
    const id = setInterval(draw, 1000);
    return () => clearInterval(id);
  }, [sessionId, nodeId]);

  return (
    <div className="stack" style={{ gap: "var(--s2)" }}>
      {/* SVG is generated locally by the qrcode lib, not user input. */}
      <div className="qr" role="img" aria-label="Attendance QR code, changes every second" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="tick" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
