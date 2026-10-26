import Image from "next/image";
import type { ReactNode } from "react";

// Student phone screens: header with the course and step progress, and the centred
// status screen used for done, closed, not open yet and wrong device.

export function PhoneHead({ title, steps, at, children }: { title: string; steps?: number; at?: number; children?: ReactNode }) {
  return (
    <header className="phone-head">
      <div className="phone-brand">
        <Image src="/logo.svg" alt="" width={27} height={28} unoptimized priority data-logo-anchor />
        <span className="phone-title">{title}</span>
        {children}
      </div>
      {steps ? (
        <div className="steps" aria-hidden="true">
          {Array.from({ length: steps }, (_, i) => (
            <span key={i} data-done={i <= at!} />
          ))}
        </div>
      ) : null}
    </header>
  );
}

const ICONS = {
  check: <path d="M6 12.5l4 4 8-9" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17.5h2" />
    </>
  ),
};

export function PhoneState({ icon, title, children }: { icon: keyof typeof ICONS; title: string; children?: ReactNode }) {
  return (
    <div className="phone-body phone-state">
      <span className="state-icon" data-icon={icon} aria-hidden="true">
        <svg viewBox="0 0 24 24">{ICONS[icon]}</svg>
      </span>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
