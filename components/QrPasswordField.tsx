"use client";

import { useState } from "react";

const VISIBLE = 14; // glyphs shown before older ones scroll off

// 3×3 module pattern for the nth character. Depends only on position, never on the
// character itself, so the glyphs reveal nothing about the password.
function glyph(n: number): boolean[] {
  let s = Math.imul(n + 1, 0x9e3779b1);
  const cells = Array.from({ length: 9 }, () => {
    s = Math.imul(s ^ (s >>> 13), 1274126177);
    return ((s >>> 16) & 1) === 1;
  });
  cells[4] = true;
  return cells;
}

export function QrPasswordField({ id, label }: { id: string; label: string }) {
  const [length, setLength] = useState(0);
  const [shown, setShown] = useState(false);
  const first = Math.max(0, length - VISIBLE);

  return (
    <div className="pill-field qr-field" data-shown={shown || undefined}>
      <span className="qr-finder" aria-hidden="true" />
      <input
        id={id}
        name="password"
        type={shown ? "text" : "password"}
        className="pill-input"
        placeholder=" "
        autoComplete="current-password"
        required
        onChange={(e) => setLength(e.target.value.length)}
      />
      <label htmlFor={id} className="pill-label">
        {label}
      </label>
      <span className="qr-glyphs" aria-hidden="true">
        {Array.from({ length: length - first }, (_, i) => first + i).map((n) => (
          <svg key={n} className="qr-glyph" viewBox="0 0 3 3">
            {glyph(n).map((filled, k) =>
              filled ? (
                <rect key={k} x={k % 3} y={Math.floor(k / 3)} width="1" height="1" style={{ animationDelay: `${k * 18}ms` }} />
              ) : null,
            )}
          </svg>
        ))}
        <span className="qr-caret" />
      </span>
      <button
        type="button"
        className="pill-eye"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
