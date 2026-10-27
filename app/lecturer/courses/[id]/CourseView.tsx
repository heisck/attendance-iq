"use client";

import { useState } from "react";
import { importRoster, resetFace, setMark } from "@/lib/actions";
import { csvCell } from "@/lib/csv";
import type { Course, Student } from "@/lib/db";

type Column = { id: string; week: number };

export function CourseView({ course, students: list, columns, marks }: { course: Course; students: Student[]; columns: Column[]; marks: string[] }) {
  const [tab, setTab] = useState<"attendance" | "roster">("attendance");
  // "<session id>:<student id>", changed here at once and saved in the background.
  const [present, setPresent] = useState(() => new Set(marks));
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const flip = (key: string) =>
    setPresent((p) => {
      const next = new Set(p);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  function toggle(col: Column, studentId: string) {
    const key = `${col.id}:${studentId}`;
    const on = !present.has(key);
    flip(key);
    setMark(col.id, studentId, on).catch(() => {
      flip(key);
      setNotice({ ok: false, text: "Couldn't save that mark. Check your connection and try again." });
    });
  }

  async function reset(s: Student) {
    if (!confirm(`Reset ${s.name}'s face? They will need to register again before they can mark attendance.`)) return;
    setBusy(s.id);
    try {
      await resetFace(s.id);
      setNotice({ ok: true, text: `${s.name}'s face was reset. They can register again.` });
    } catch {
      setNotice({ ok: false, text: "Couldn't reset that face. Try again." });
    }
    setBusy("");
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    setBusy("import");
    try {
      const r = await importRoster(course.id, await file.text());
      setNotice(
        "error" in r
          ? { ok: false, text: r.error }
          : { ok: !r.skipped.length, text: `${r.added} ${r.added === 1 ? "student" : "students"} imported.${r.skipped.length ? ` Skipped ${r.skipped.length}: ${r.skipped.slice(0, 3).join("; ")}${r.skipped.length > 3 ? "; …" : ""}` : ""}` },
      );
    } catch {
      setNotice({ ok: false, text: "Import failed. Check the file and try again." });
    }
    setBusy("");
  }

  function exportCsv() {
    const header = ["Name", "Email", "Student number", "Index number", ...columns.map((c) => `Week ${c.week}`)];
    const rows = list.map((s) => [s.name, s.email, s.studentNo, s.indexNo, ...columns.map((c) => (present.has(`${c.id}:${s.id}`) ? "P" : "A"))]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${course.code.replace(/\s+/g, "")}-attendance.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const registered = list.filter((s) => s.registered).length;
  const avg = list.length && columns.length ? Math.round((present.size / (list.length * columns.length)) * 100) : 0;

  return (
    <main className="page cv">
      <div className="ls-head">
        <div>
          <p className="muted">{course.name}</p>
          <h1 className="ls-title">{course.code}</h1>
        </div>
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={tab === "attendance"} onClick={() => setTab("attendance")}>
            Attendance
          </button>
          <button aria-pressed={tab === "roster"} onClick={() => setTab("roster")}>
            Roster
          </button>
        </div>
      </div>

      <dl className="course-facts cv-facts">
        <div>
          <dt>Students</dt>
          <dd>{list.length}</dd>
        </div>
        <div>
          <dt>Registered</dt>
          <dd>
            {registered}/{list.length}
          </dd>
        </div>
        <div>
          <dt>Average attendance</dt>
          <dd>{columns.length ? `${avg}%` : "No weeks yet"}</dd>
        </div>
      </dl>

      {notice && (
        <p className={`notice ${notice.ok ? "notice-ok" : "notice-danger"}`} role="status">
          {notice.text}
        </p>
      )}

      {tab === "attendance" ? (
        <>
          <div className="spread">
            <p className="muted small">Tap a mark to set it by hand (dead phone, broken camera).</p>
            <button className="btn btn-outline" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Index no.</th>
                  {columns.map((c) => (
                    <th key={c.id} style={{ textAlign: "center" }}>
                      Wk {c.week}
                    </th>
                  ))}
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const count = columns.filter((c) => present.has(`${c.id}:${s.id}`)).length;
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="mono">{s.indexNo}</td>
                      {columns.map((c) => {
                        const on = present.has(`${c.id}:${s.id}`);
                        return (
                          <td key={c.id} className="cv-cell">
                            <button
                              className="cell-mark"
                              aria-pressed={on}
                              aria-label={`${s.name}, week ${c.week}: ${on ? "present" : "absent"}. Toggle.`}
                              onClick={() => toggle(c, s.id)}
                            >
                              <span aria-hidden="true">{on ? "P" : "–"}</span>
                            </button>
                          </td>
                        );
                      })}
                      <td>
                        <span className="cv-rate">
                          <span className="bar bar-light" aria-hidden="true">
                            <span style={{ width: `${columns.length ? (count / columns.length) * 100 : 0}%` }} />
                          </span>
                          {columns.length ? Math.round((count / columns.length) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="spread">
            <p className="muted small">
              CSV columns: name, email, student number, index number.
            </p>
            <label className="btn btn-outline" aria-disabled={busy === "import" || undefined}>
              {busy === "import" ? "Importing…" : "Import roster CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={busy === "import"}
                onChange={(e) => {
                  importCsv(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Student no.</th>
                  <th>Index no.</th>
                  <th>Face</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.email}</td>
                    <td className="mono">{s.studentNo}</td>
                    <td className="mono">{s.indexNo}</td>
                    <td>
                      {!s.registered ? (
                        <span className="pill">Not yet</span>
                      ) : s.status === "active" ? (
                        <span className="pill pill-ink">Registered</span>
                      ) : (
                        <span className="pill pill-warn">Awaiting approval</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {s.registered && (
                        <button className="btn btn-sm btn-outline btn-reject" disabled={busy === s.id} onClick={() => reset(s)}>
                          Reset face
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
