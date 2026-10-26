"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

// `src`: a Server-Sent Events stream of signed codes, one per second (the server makes them; this
// screen never holds the secret). The stream sends "closed" when the session ends.
// `value`: a fixed code instead (the registration link).
export function RotatingQr({ src, value, onClosed }: { src?: string; value?: string; onClosed?: () => void }) {
  const [svg, setSvg] = useState("");
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const draw = (text: string) => QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(setSvg);
    if (value) {
      draw(value);
      return;
    }
    if (!src) return;
    const events = new EventSource(src);
    events.onmessage = (e) => {
      setLost(false);
      draw(e.data);
    };
    events.addEventListener("closed", () => {
      events.close();
      onClosed?.();
    });
    // EventSource retries by itself after a dropped connection; a refused one (closed session) stays CLOSED.
    events.onerror = () => {
      setLost(true);
      if (events.readyState === EventSource.CLOSED) onClosed?.();
    };
    return () => events.close();
  }, [src, value, onClosed]);

  return (
    <div className="stack" style={{ gap: "var(--s2)" }}>
      {/* SVG is generated locally by the qrcode lib from a server-signed code, not user input. */}
      <div className="qr" role="img" aria-label={value ? "QR code for the student link" : "Attendance QR code, changes every second"} data-lost={lost || undefined} dangerouslySetInnerHTML={{ __html: svg }} />
      {!value && (
        <div className="tick" aria-hidden="true">
          <span />
        </div>
      )}
    </div>
  );
}
