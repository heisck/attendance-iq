import { notFound } from "next/navigation";
import { PhoneHead, PhoneState } from "@/components/Phone";
import { PhoneOnly } from "@/components/PhoneOnly";
import { courses, sessions } from "@/mocks/data";
import { Attend } from "./Attend";
import { Register } from "./Register";

export default async function StudentLink({ params, searchParams }: PageProps<"/s/[id]">) {
  const { id } = await params;
  const { outcome } = await searchParams;
  const session = sessions.find((s) => s.id === id);
  if (!session) notFound();
  const course = courses.find((c) => c.id === session.courseId)!;
  const title = `${course.code} · Week ${session.week}`;

  if (session.status !== "live") {
    return (
      <PhoneOnly>
        <main className="phone">
          <PhoneHead title={title} />
          {session.status === "scheduled" ? (
            <PhoneState icon="clock" title="Not open yet">
              <p className="muted">
                Opens {new Date(`${session.date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}{" "}
                at {session.start}. Come back then.
              </p>
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
        <Register title={`${course.code} · Registration`} courseId={course.id} autoApprove={session.autoApproveEdits} />
      ) : (
        <Attend title={title} sessionId={session.id} outcome={typeof outcome === "string" ? outcome : undefined} />
      )}
    </PhoneOnly>
  );
}
