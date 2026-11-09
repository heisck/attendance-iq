import { notFound } from "next/navigation";
import { getSession, liveNodes } from "@/lib/db";
import { qrKey } from "@/lib/sign";
import { LiveSession } from "./LiveSession";

export default async function SessionPage({ params }: PageProps<"/lecturer/session/[id]">) {
  const { id } = await params;
  const session = await getSession(id, true);
  if (!session) notFound();
  const attendance = session.kind === "attendance";
  const nodes = attendance ? await liveNodes(id) : [];
  // The lecturer's screen is node "lecturer": its key lets this signed-in page make the codes itself.
  return <LiveSession session={session} nodes={nodes} qrKey={attendance ? qrKey(id, "lecturer") : ""} />;
}
