import { notFound } from "next/navigation";
import { getSession, liveNodes } from "@/lib/db";
import { LiveSession } from "./LiveSession";

export default async function SessionPage({ params }: PageProps<"/lecturer/session/[id]">) {
  const { id } = await params;
  const session = await getSession(id, true);
  if (!session) notFound();
  const nodes = session.kind === "attendance" ? await liveNodes(id) : [];
  return <LiveSession session={session} nodes={nodes} />;
}
