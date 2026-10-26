import { listSessions } from "@/lib/db";
import { SessionRow } from "../SessionRow";

export default async function History() {
  const past = (await listSessions()).filter((s) => s.status === "closed").sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));

  return (
    <main className="page page-narrow">
      <p className="muted">Closed sessions, newest first. Open one to see who was there.</p>
      {past.length ? (
        <ul className="srows">
          {past.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </ul>
      ) : (
        <p className="muted">No sessions have closed yet.</p>
      )}
    </main>
  );
}
