import { notFound } from "next/navigation";
import { getSession, liveNodes, sessionCounts } from "@/lib/db";
import { LiveSession } from "./LiveSession";

export default async function SessionPage({ params }: PageProps<"/lecturer/session/[id]">) {
  const { id } = await params;
  const session = await getSession(id, true);
  if (!session) notFound();
  const [counts, nodes] = await Promise.all([sessionCounts(session), session.kind === "attendance" ? liveNodes(id) : []]);
  return <LiveSession session={{ ...session, ...counts }} nodes={nodes} />;
}
