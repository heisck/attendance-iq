import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export default function LecturerLayout({ children }: LayoutProps<"/lecturer">) {
  return (
    <div className="lect">
      <Sidebar />
      <div className="sheet">
        <Topbar />
        {children}
      </div>
    </div>
  );
}
