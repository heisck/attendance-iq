// Session timing. One timezone per deployment (APP_TIMEZONE, an IANA name such as Africa/Accra):
// the lecturer types local dates and times, checks run on epoch ms.

const TZ = process.env.APP_TIMEZONE || "UTC";

export type SessionKind = "registration" | "attendance";
export type SessionStatus = "scheduled" | "live" | "closed";
type Timing = { opensAt: number; closesAt: number; startedAt: number | null; stoppedAt: number | null };

// The lecturer's window rules: a session opens by itself at opensAt (or earlier, on Start) and closes
// at closesAt (or earlier, on Stop). Start after a Stop reopens it until closesAt.
export function sessionStatus(s: Timing, now = Date.now()): SessionStatus {
  if (s.stoppedAt || now >= s.closesAt) return "closed";
  return s.startedAt || now >= s.opensAt ? "live" : "scheduled";
}

// When it actually opened: Start, else opensAt once that has passed. Null = never opened, so not held
// (still ahead, or stopped beforehand to cancel it). `startedAt` here is the stored Start time.
export const openedAt = (s: Timing, now = Date.now()) =>
  s.startedAt ?? (now >= s.opensAt && !(s.stoppedAt && s.stoppedAt <= s.opensAt) ? s.opensAt : null);

// "2026-11-02" + "08:00" in `tz` -> epoch ms.
export function zoned(date: string, time: string, tz = TZ) {
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  const shown = Date.parse(new Date(asUtc).toLocaleString("sv-SE", { timeZone: tz }).replace(" ", "T") + "Z");
  return asUtc - (shown - asUtc);
}

// YYYY-MM-DD in `tz`.
export const today = (now = Date.now(), tz = TZ) => new Date(now).toLocaleDateString("sv-SE", { timeZone: tz });
