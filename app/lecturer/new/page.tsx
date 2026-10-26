import { listCourses } from "@/lib/db";
import { NewSession } from "./NewSession";

export default async function NewSessionPage() {
  return <NewSession courses={await listCourses()} />;
}
