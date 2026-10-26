// Session timing. One timezone per deployment (APP_TIMEZONE, an IANA name such as Africa/Accra):
// the lecturer types local dates and times, checks run on epoch ms.

export const AUTO_CLOSE_MS = 30 * 60_000;
const TZ = process.env.APP_TIMEZONE || "UTC";

export type SessionKind = "registration" | "attendance";
export type SessionStatus = "scheduled" | "live" | "closed";
type Timing = { kind: SessionKind; opensAt: number; closesAt: number; startedAt: number | null; stoppedAt: number | null };

// Attendance opens when the lecturer presses Start and closes 30 minutes later. Registration opens by
// itself at opensAt (or earlier, on Start). Both close on Stop or at closesAt.
export function sessionStatus(s: Timing, now = Date.now()): SessionStatus {
  if (s.stoppedAt || now >= s.closesAt) return "closed";
  if (s.kind === "attendance") return !s.startedAt ? "scheduled" : now < s.startedAt + AUTO_CLOSE_MS ? "live" : "closed";
  return s.startedAt || now >= s.opensAt ? "live" : "scheduled";
}

// "2026-11-02" + "08:00" in `tz` -> epoch ms.
export function zoned(date: string, time: string, tz = TZ) {
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  const shown = Date.parse(new Date(asUtc).toLocaleString("sv-SE", { timeZone: tz }).replace(" ", "T") + "Z");
  return asUtc - (shown - asUtc);
}

// YYYY-MM-DD in `tz`.
export const today = (now = Date.now(), tz = TZ) => new Date(now).toLocaleDateString("sv-SE", { timeZone: tz });
