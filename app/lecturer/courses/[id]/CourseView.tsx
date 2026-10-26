"use client";

import { useState } from "react";
import type { Course, RosterEntry } from "@/mocks/data";

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function CourseView({
  course,
  students,
  weeks,
  attendance,
}: {
  course: Course;
  students: RosterEntry[];
  weeks: number[];
  attendance: Record<number, string[]>;
}) {
  const [tab, setTab] = useState<"attendance" | "roster">("attendance");
  const [present, setPresent] = useState(() => new Set(weeks.flatMap((w) => (attendance[w] ?? []).map((id) => `${w}:${id}`))));
  const [list, setList] = useState(students);

  function toggle(key: string) {
    setPresent((p) => {
      const next = new Set(p);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function exportCsv() {
    const header = ["Name", "Email", "Student number", "Index number", ...weeks.map((w) => `Week ${w}`)];
    const rows = list.map((s) => [s.name, s.email, s.studentNo, s.indexNo, ...weeks.map((w) => (present.has(`${w}:${s.id}`) ? "P" : "A"))]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${course.code.replace(/\s+/g, "")}-attendance.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const registered = list.filter((s) => s.registered).length;
  const avg = list.length && weeks.length ? Math.round((present.size / (list.length * weeks.length)) * 100) : 0;

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
          <dd>{weeks.length ? `${avg}%` : "No weeks yet"}</dd>
        </div>
      </dl>

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
                  {weeks.map((w) => (
                    <th key={w} style={{ textAlign: "center" }}>
                      Wk {w}
                    </th>
                  ))}
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const count = weeks.filter((w) => present.has(`${w}:${s.id}`)).length;
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="mono">{s.indexNo}</td>
                      {weeks.map((w) => {
                        const key = `${w}:${s.id}`;
                        const on = present.has(key);
                        return (
                          <td key={w} className="cv-cell">
                            <button
                              className="cell-mark"
                              aria-pressed={on}
                              aria-label={`${s.name}, week ${w}: ${on ? "present" : "absent"}. Toggle.`}
                              onClick={() => toggle(key)}
                            >
                              <span aria-hidden="true">{on ? "P" : "–"}</span>
                            </button>
                          </td>
                        );
                      })}
                      <td>
                        <span className="cv-rate">
                          <span className="bar bar-light" aria-hidden="true">
                            <span style={{ width: `${weeks.length ? (count / weeks.length) * 100 : 0}%` }} />
                          </span>
                          {weeks.length ? Math.round((count / weeks.length) * 100) : 0}%
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
            <label className="btn btn-outline">
              Import roster CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" />
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
                    <td>{s.registered ? <span className="pill pill-ink">Registered</span> : <span className="pill">Not yet</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      {s.registered && (
                        <button
                          className="btn btn-sm btn-outline btn-reject"
                          onClick={() => setList((l) => l.map((x) => (x.id === s.id ? { ...x, registered: false } : x)))}
                        >
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
