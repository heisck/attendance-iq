// Mock data for the UI phase. Replaced by Turso + Upstash once the UI is approved.

export type Course = { id: string; code: string; name: string };
export type RosterEntry = {
  id: string;
  courseId: string;
  name: string;
  email: string;
  studentNo: string;
  indexNo: string;
  registered: boolean;
};
export type SessionKind = "registration" | "attendance";
export type SessionStatus = "scheduled" | "live" | "closed";
export type Session = {
  id: string;
  courseId: string;
  week: number;
  kind: SessionKind;
  date: string;
  start: string;
  end: string;
  status: SessionStatus;
  autoApproveEdits: boolean;
};
// A student tab that became a node. `from` is whose QR it scanned; `marked` is people verified on that phone.
export type Node = { id: string; from: string; marked: number };
export type Approval =
  | {
      id: string;
      kind: "duplicate_face";
      courseId: string;
      student: string;
      indexNo: string;
      matches: string;
      matchesIndexNo: string;
      similarity: number;
      submittedAt: string;
    }
  | {
      id: string;
      kind: "edit";
      courseId: string;
      student: string;
      indexNo: string;
      changes: { field: string; from: string; to: string }[];
      submittedAt: string;
    };

export const courses: Course[] = [
  { id: "c1", code: "CSM 281", name: "Data Structures" },
  { id: "c2", code: "CSM 357", name: "Computer Networks" },
];

export const roster: RosterEntry[] = [
  { id: "r1", courseId: "c1", name: "Kwame Mensah", email: "kmensah@st.uni.edu.gh", studentNo: "20831244", indexNo: "4211822", registered: true },
  { id: "r2", courseId: "c1", name: "Akosua Owusu", email: "aowusu12@st.uni.edu.gh", studentNo: "20835510", indexNo: "4214821", registered: true },
  { id: "r3", courseId: "c1", name: "Kofi Asante", email: "kasante3@st.uni.edu.gh", studentNo: "20830098", indexNo: "4210376", registered: false },
  { id: "r4", courseId: "c1", name: "Ama Boateng", email: "aboateng@st.uni.edu.gh", studentNo: "20832761", indexNo: "4212907", registered: true },
  { id: "r5", courseId: "c1", name: "Yaw Darko", email: "ydarko5@st.uni.edu.gh", studentNo: "20834419", indexNo: "4213554", registered: false },
  { id: "r6", courseId: "c1", name: "Abena Darko", email: "adarko@st.uni.edu.gh", studentNo: "20834420", indexNo: "4213555", registered: true },
  { id: "r7", courseId: "c1", name: "Esi Appiah", email: "eappiah@st.uni.edu.gh", studentNo: "20830712", indexNo: "4210988", registered: false },
  { id: "r8", courseId: "c1", name: "Kojo Addo", email: "kaddo2@st.uni.edu.gh", studentNo: "20833380", indexNo: "4212140", registered: true },
  { id: "r9", courseId: "c1", name: "Adwoa Kyei", email: "akyei@st.uni.edu.gh", studentNo: "20831906", indexNo: "4211633", registered: true },
  { id: "r10", courseId: "c1", name: "Kwabena Ofori", email: "kofori@st.uni.edu.gh", studentNo: "20835077", indexNo: "4214410", registered: false },
];

export const sessions: Session[] = [
  { id: "s1", courseId: "c1", week: 1, kind: "registration", date: "2026-10-12", start: "08:00", end: "10:00", status: "closed", autoApproveEdits: false },
  { id: "s2", courseId: "c1", week: 2, kind: "attendance", date: "2026-10-19", start: "08:00", end: "10:00", status: "closed", autoApproveEdits: false },
  { id: "s3", courseId: "c1", week: 3, kind: "attendance", date: "2026-10-26", start: "08:00", end: "10:00", status: "live", autoApproveEdits: false },
  { id: "reg", courseId: "c1", week: 3, kind: "registration", date: "2026-10-26", start: "07:00", end: "18:00", status: "live", autoApproveEdits: false },
  { id: "s4", courseId: "c2", week: 3, kind: "registration", date: "2026-10-28", start: "13:00", end: "15:00", status: "scheduled", autoApproveEdits: true },
];

export const nodes: Node[] = [
  { id: "0B3D", from: "7F2A", marked: 5 },
  { id: "7F2A", from: "Your screen", marked: 1 },
  { id: "C91E", from: "Your screen", marked: 1 },
  { id: "E44C", from: "0B3D", marked: 1 },
];

export const approvals: Approval[] = [
  { id: "a1", kind: "duplicate_face", courseId: "c1", student: "Abena Darko", indexNo: "4213555", matches: "Yaw Darko", matchesIndexNo: "4213554", similarity: 0.91, submittedAt: "2026-10-12 08:41" },
  { id: "a2", kind: "edit", courseId: "c1", student: "Kojo Addo", indexNo: "4212140", changes: [{ field: "Email", from: "kaddo2@st.uni.edu.gh", to: "kojo.addo@st.uni.edu.gh" }], submittedAt: "2026-10-12 08:47" },
  { id: "a3", kind: "edit", courseId: "c1", student: "Esi Appiah-Kubi", indexNo: "4210988", changes: [{ field: "Name", from: "Esi Appiah", to: "Esi Appiah-Kubi" }, { field: "Student number", from: "20830712", to: "20830721" }], submittedAt: "2026-10-12 09:02" },
];

// Week number -> roster ids present.
export const attendance: Record<number, string[]> = {
  2: ["r1", "r2", "r4", "r6", "r8", "r9"],
  3: ["r1", "r4", "r8"],
};

export const LECTURER_NAME = "Dr. Adjei";
