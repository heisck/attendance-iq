"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { makeCode } from "@/lib/code";

// What a screen needs to make its own codes: its node's QR key, and how far this device's clock is from
// the server's (codes carry server time). `until`: server time after which the session has auto-closed.
export type QrSource = { key: string; sessionId: string; node: string; offset: number; until?: number };

// `source`: a new code each second, made right here (no server round trip).
// `value`: a fixed code instead (the registration link).
export function RotatingQr({ source, value, onClosed }: { source?: QrSource; value?: string; onClosed?: () => void }) {
  const [svg, setSvg] = useState("");
  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  }, [onClosed]);
  const { key, sessionId, node, offset, until } = source ?? {};

  useEffect(() => {
    const draw = (text: string) => QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(setSvg);
    if (value) {
      draw(value);
      return;
    }
    if (!key || !sessionId || !node) return;
    // Checked 4 times a second so a new code shows within 250 ms of the second turning over.
    let second = 0;
    const tick = () => {
      const now = Date.now() + (offset ?? 0);
      if (until && now > until) return closed.current?.();
      if (Math.floor(now / 1000) === second) return;
      second = Math.floor(now / 1000);
      makeCode(key, sessionId, node, now).then(draw);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [value, key, sessionId, node, offset, until]);

  return (
    <div className="stack" style={{ gap: "var(--s2)" }}>
      {/* SVG is generated locally by the qrcode lib from a signed code, not user input. */}
      <div className="qr" role="img" aria-label={value ? "QR code for the student link" : "Attendance QR code, changes every second"} dangerouslySetInnerHTML={{ __html: svg }} />
      {!value && (
        <div className="tick" aria-hidden="true">
          <span />
        </div>
      )}
    </div>
  );
}
