import { redirect } from "next/navigation";
import { listApprovals } from "@/lib/db";
import { isLecturer } from "@/lib/ticket";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export default async function LecturerLayout({ children }: LayoutProps<"/lecturer">) {
  // proxy.ts already gates these pages; checking here too keeps every lecturer page rendered per request.
  if (!(await isLecturer())) redirect("/login");
  const approvals = await listApprovals();
  return (
    <div className="lect">
      <Sidebar />
      <div className="sheet">
        <Topbar name={process.env.LECTURER_NAME || "Lecturer"} approvals={approvals} />
        {children}
      </div>
    </div>
  );
}
