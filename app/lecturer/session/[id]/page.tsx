import { notFound } from "next/navigation";
import { after } from "next/server";
import { warmFace } from "@/lib/face";
import { getSession, liveNodes } from "@/lib/db";
import { qrKey } from "@/lib/sign";
import { LiveSession } from "./LiveSession";

export default async function SessionPage({ params }: PageProps<"/lecturer/session/[id]">) {
  const { id } = await params;
  const session = await getSession(id, true);
  if (!session) notFound();
  const attendance = session.kind === "attendance";
  const nodes = attendance ? await liveNodes(id) : [];
  // A session that opened by itself had no Start to wake the face service; opening this page does it.
  if (session.status === "live") after(warmFace);
  // The lecturer's screen is node "lecturer": its key lets this signed-in page make the codes itself.
  return <LiveSession session={session} nodes={nodes} qrKey={attendance ? qrKey(id, "lecturer") : ""} />;
}
