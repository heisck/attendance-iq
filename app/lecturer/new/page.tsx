"use client";

import Link from "next/link";
import { useState } from "react";
import { PillField as Pill } from "@/components/PillField";
import { courses, roster } from "@/mocks/data";
import { day } from "../SessionRow";

const KINDS = {
  attendance: { label: "Attendance", note: "Students scan the rotating QR and verify their face." },
  registration: { label: "Registration", note: "Students claim their roster entry and enrol their face." },
};

const CLOCK = (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>
);

export default function NewSession() {
  const [courseId, setCourseId] = useState(courses[0].id);
  const [kind, setKind] = useState<keyof typeof KINDS>("attendance");
  const [autoApprove, setAutoApprove] = useState(false);
  const [code, setCode] = useState("");
  const [week, setWeek] = useState("4");
  const [date, setDate] = useState("2026-11-02");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("10:00");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  const isNew = courseId === "new";
  const course = courses.find((c) => c.id === courseId);
  const when = date ? `${day(date, { weekday: "short", day: "numeric", month: "short" })} · ${start}–${end}` : `${start}–${end}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  if (link) {
    return (
      <main className="page page-narrow">
        <section className="live-card ns-ready" aria-labelledby="ready-h">
          <span className="live-finder" aria-hidden="true" />
          <span className="pill">Link ready</span>
          <h2 id="ready-h" className="live-code">
            {isNew ? code || "New course" : course!.code}
          </h2>
          <p className="live-meta">
            {KINDS[kind].label} · Week {week} · {when}
          </p>
          <p className="ns-link">{link}</p>
          <p className="live-name">Share it with your students. It only opens between {start} and {end}.</p>
          <div className="row">
            <button className="btn btn-light" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button className="btn btn-light" onClick={() => navigator.share({ url: link })}>
                Share link
              </button>
            )}
            <Link href="/lecturer/session/s3" className="btn btn-outline-light">
              Go to session
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="ns">
        <form
          className="ns-form"
          onSubmit={(e) => {
            e.preventDefault();
            // Mock: the real link is created by the server.
            setLink(`${window.location.origin}/s/${kind === "attendance" ? "s3" : "s4"}`);
          }}
        >
          <fieldset className="ns-step">
            <legend>Type</legend>
            <div className="choices">
              {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => (
                <label key={k} className="choice">
                  <input type="radio" name="kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
                  <strong>{KINDS[k].label}</strong>
                  <span>{KINDS[k].note}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="ns-step">
            <legend>Course</legend>
            <div className="choices">
              {courses.map((c) => (
                <label key={c.id} className="choice">
                  <input type="radio" name="course" className="sr-only" checked={courseId === c.id} onChange={() => setCourseId(c.id)} />
                  <strong>{c.code}</strong>
                  <span>
                    {c.name} · {roster.filter((r) => r.courseId === c.id).length} students
                  </span>
                </label>
              ))}
              <label className="choice choice-add">
                <input type="radio" name="course" className="sr-only" checked={isNew} onChange={() => setCourseId("new")} />
                <strong>New course</strong>
                <span>Add its roster afterwards.</span>
              </label>
            </div>
            {isNew ? (
              <div className="ns-pair">
                <Pill
                  id="code"
                  label="Course code"
                  placeholder=" "
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  icon={<path d="M4 12.5V5.5A1.5 1.5 0 0 1 5.5 4h7l7.5 7.5-8 8.5zM8.5 8.5h.01" />}
                />
                <Pill id="cname" label="Course name" placeholder=" " required icon={<path d="M5 5h14M5 12h14M5 19h9" />} />
              </div>
            ) : (
              <p className="hint">
                <Link href={`/lecturer/courses/${courseId}`}>Manage the {course!.code} roster</Link>
              </p>
            )}
          </fieldset>

          <fieldset className="ns-step">
            <legend>When</legend>
            <div className="ns-pair">
              <Pill
                id="week"
                label="Week"
                type="number"
                min={1}
                max={20}
                required
                value={week}
                onChange={(e) => setWeek(e.target.value)}
                icon={<path d="M9 4 7 20M17 4l-2 16M4.5 9h15M4 15h15" />}
              />
              <Pill
                id="date"
                label="Date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                icon={
                  <>
                    <rect x="3.5" y="5" width="17" height="15" rx="3" />
                    <path d="M3.5 10h17M8 3v4M16 3v4" />
                  </>
                }
              />
              <Pill id="start" label="Opens" type="time" required value={start} onChange={(e) => setStart(e.target.value)} icon={CLOCK} />
              <Pill id="end" label="Closes" type="time" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} icon={CLOCK} />
            </div>
            <p className="hint">
              The link only works between these times. Attendance also stops when you press Stop, or 30 minutes after you press Start.
            </p>
          </fieldset>

          {kind === "registration" && (
            <fieldset className="ns-step">
              <legend>When students change roster details</legend>
              <div className="choices">
                <label className="choice">
                  <input type="radio" name="edits" className="sr-only" checked={!autoApprove} onChange={() => setAutoApprove(false)} />
                  <strong>I approve</strong>
                  <span>Changes wait in the bell until you decide.</span>
                </label>
                <label className="choice">
                  <input type="radio" name="edits" className="sr-only" checked={autoApprove} onChange={() => setAutoApprove(true)} />
                  <strong>Auto-approve</strong>
                  <span>Changes apply straight away.</span>
                </label>
              </div>
              <p className="hint">Possible duplicate faces always need your approval.</p>
            </fieldset>
          )}

          <div className="ns-actions">
            <Link href="/lecturer" className="btn btn-outline">
              Cancel
            </Link>
            <button className="btn btn-ink">Create link</button>
          </div>
        </form>

        {/* What it will look like on the dashboard, updated as the form changes. */}
        <aside className="ns-preview" aria-label="Preview">
          <p className="ns-preview-label">Preview</p>
          <div className="live-card">
            <span className="live-finder" aria-hidden="true" />
            <span className="pill">Scheduled</span>
            <p className="live-code">{isNew ? code || "New course" : course!.code}</p>
            <p className="live-name">{isNew ? "Roster to follow" : course!.name}</p>
            <p className="live-meta">
              {KINDS[kind].label} · Week {week || "?"} · {when}
            </p>
            <p className="live-name ns-preview-note">{KINDS[kind].note}</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
