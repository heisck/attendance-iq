"use client";

import { useSyncExternalStore } from "react";
import { PhoneState } from "./Phone";

// Students: phones only. Tablets, laptops, desktops and Samsung DeX have a short side >= 600px.
// Not a security check (screen size can be faked), just keeps students on the device the flow is built for.
const PHONE_MAX_SHORT_SIDE = 600;

function isPhone() {
  if (process.env.NEXT_PUBLIC_DEV_ALLOW_DESKTOP === "true") return true;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return shortSide < PHONE_MAX_SHORT_SIDE && window.matchMedia("(pointer: coarse)").matches;
}

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

export function PhoneOnly({ children }: { children: React.ReactNode }) {
  const phone = useSyncExternalStore(subscribe, isPhone, () => null);

  if (phone === null) return null;
  if (phone) return children;

  return (
    <main className="phone">
      <PhoneState icon="phone" title="Open this link on your phone">
        <p className="muted">Attendance only works on a phone. Tablets, laptops and desktop mode are not supported.</p>
      </PhoneState>
    </main>
  );
}
