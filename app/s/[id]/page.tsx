import { notFound } from "next/navigation";
import { PhoneHead, PhoneState } from "@/components/Phone";
import { PhoneOnly } from "@/components/PhoneOnly";
import { getSession } from "@/lib/db";
import { Attend } from "./Attend";
import { Register } from "./Register";

// Before its window, or past it and waiting for the lecturer's Start.
const beforeWindow = (opensAt: number) => Date.now() < opensAt;

export default async function StudentLink({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();
  const title = `${session.code} · Week ${session.week}`;

  if (session.status !== "live") {
    return (
      <PhoneOnly>
        <main className="phone">
          <PhoneHead title={title} />
          {session.status === "scheduled" ? (
            <PhoneState icon="clock" title="Not open yet">
              {beforeWindow(session.opensAt) ? (
                <p className="muted">
                  Opens {new Date(`${session.date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}{" "}
                  at {session.start}. Come back then.
                </p>
              ) : (
                <p className="muted">Your lecturer hasn&apos;t started it yet. Reload this page once they do.</p>
              )}
            </PhoneState>
          ) : (
            <PhoneState icon="lock" title="This link is closed">
              <p className="muted">Ask your lecturer if you think you should have been marked.</p>
            </PhoneState>
          )}
        </main>
      </PhoneOnly>
    );
  }

  return (
    <PhoneOnly>
      {session.kind === "registration" ? (
        <Register title={`${session.code} · Registration`} sessionId={session.id} autoApprove={session.autoApproveEdits} />
      ) : (
        <Attend title={title} sessionId={session.id} />
      )}
    </PhoneOnly>
  );
}
