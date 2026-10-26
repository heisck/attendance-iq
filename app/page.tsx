import { redirect } from "next/navigation";

// Lecturers land on the dashboard (proxy.ts sends signed-out visitors to /login). Students only use /s/<id> links.
export default function Home() {
  redirect("/lecturer");
}
