import { listApprovals } from "@/lib/db";
import { ApprovalList } from "./ApprovalList";

export default async function Approvals() {
  return <ApprovalList items={await listApprovals()} />;
}
