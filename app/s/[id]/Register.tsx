"use client";

import { useCallback, useState } from "react";
import { FaceCheck } from "@/components/FaceCheck";
import { PhoneHead, PhoneState } from "@/components/Phone";
import { PillField } from "@/components/PillField";
import { roster, type RosterEntry } from "@/mocks/data";

type Field = "name" | "email" | "studentNo" | "indexNo";
const LABELS: Record<Field, string> = {
  name: "Full name",
  email: "Student email",
  studentNo: "Student number",
  indexNo: "Index number",
};
const ICONS: Record<Field, React.ReactNode> = {
  name: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 7.5l8 5.5 8-5.5" />
    </>
  ),
  studentNo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.5-1.5 1.6-2.2 3-2.2s2.5.7 3 2.2M14.5 10h3M14.5 13.5h3" />
    </>
  ),
  indexNo: <path d="M9 4 7 20M17 4l-2 16M4.5 9h15M4 15h15" />,
};
const EMPTY = { name: "", email: "", studentNo: "", indexNo: "" };

// Masked so the suggestion list can't be used to harvest classmates' details.
function mask(field: Field, value: string) {
  if (field === "email") {
    const [user, domain] = value.split("@");
    return `${user[0]}••••@${domain}`;
  }
  return `••••${value.slice(-3)}`;
}

export function Register({ title, courseId, autoApprove }: { title: string; courseId: string; autoApprove: boolean }) {
  const [step, setStep] = useState<"details" | "face" | "done">("details");
  const [picked, setPicked] = useState<RosterEntry | null>(null);
  const [values, setValues] = useState(EMPTY);
  const [editing, setEditing] = useState<Record<Field, boolean>>({ name: true, email: true, studentNo: true, indexNo: true });
  const [consent, setConsent] = useState(false);

  // Mock: server-side search, min 3 letters, max 5 results, names only, rate limited.
  const query = values.name.trim().toLowerCase();
  const suggestions =
    !picked && query.length >= 3
      ? roster.filter((r) => r.courseId === courseId && !r.registered && r.name.toLowerCase().includes(query)).slice(0, 5)
      : [];

  function pick(r: RosterEntry) {
    setPicked(r);
    setValues({ name: r.name, email: r.email, studentNo: r.studentNo, indexNo: r.indexNo });
    setEditing({ name: false, email: false, studentNo: false, indexNo: false });
  }

  function clearPick() {
    setPicked(null);
    setValues(EMPTY);
    setEditing({ name: true, email: true, studentNo: true, indexNo: true });
  }

  function edit(field: Field) {
    setEditing((e) => ({ ...e, [field]: true }));
    setValues((v) => ({ ...v, [field]: "" }));
  }

  const hasEdits = !picked || (Object.keys(EMPTY) as Field[]).some((f) => values[f] !== picked[f]);
  const complete = (Object.keys(EMPTY) as Field[]).every((f) => values[f].trim()) && consent;
  const faceDone = useCallback(() => setStep("done"), []);

  return (
    <main className="phone">
      <PhoneHead title={title} steps={3} at={["details", "face", "done"].indexOf(step)} />

      {step === "details" && (
        <form
          style={{ display: "contents" }}
          onSubmit={(e) => {
            e.preventDefault();
            setStep("face");
          }}
        >
          <div className="phone-body">
            <h1>Register for this course</h1>
            <p className="muted">Start typing your name and pick it from the list. Not listed? Fill in everything yourself.</p>

            {(Object.keys(LABELS) as Field[]).map((field) => (
              <div className="field" key={field}>
                {editing[field] ? (
                  <PillField
                    id={field}
                    label={LABELS[field]}
                    icon={ICONS[field]}
                    type={field === "email" ? "email" : "text"}
                    inputMode={field === "studentNo" || field === "indexNo" ? "numeric" : undefined}
                    autoComplete="off"
                    placeholder=" "
                    required
                    value={values[field]}
                    onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                  />
                ) : (
                  // Picked from the roster: shown masked, with its own Change segment.
                  <div className="pill-field pill-locked">
                    <svg className="pill-icon" viewBox="0 0 24 24" aria-hidden="true">
                      {ICONS[field]}
                    </svg>
                    <span id={field} className={`pill-value ${field === "name" ? "" : "mono"}`}>
                      {field === "name" ? values.name : mask(field, values[field])}
                    </span>
                    <span className="pill-label">{LABELS[field]}</span>
                    <button type="button" className="pill-eye pill-change" onClick={() => edit(field)} aria-label={`Change ${LABELS[field]}`}>
                      Change
                    </button>
                  </div>
                )}
                {field === "name" && suggestions.length > 0 && (
                  <ul className="suggest" aria-label="Matching names">
                    {suggestions.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => pick(r)}>
                          {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {picked && (
              <button type="button" className="btn btn-sm btn-outline" onClick={clearPick} style={{ alignSelf: "flex-start" }}>
                Not me, start over
              </button>
            )}

            {picked && hasEdits && (
              <p className="notice">
                {autoApprove
                  ? "You changed some details. They'll be saved as you typed them."
                  : "You changed some details. Your lecturer will approve them."}
              </p>
            )}

            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                I agree to a face template being stored to verify my attendance in this course. No photos are kept.
              </span>
            </label>

            <div className="honeypot" aria-hidden="true">
              <label htmlFor="company">Company</label>
              <input id="company" name="company" tabIndex={-1} autoComplete="off" />
            </div>
          </div>
          <div className="phone-foot">
            <button className="btn btn-ink btn-block" disabled={!complete}>
              Continue to face check
            </button>
          </div>
        </form>
      )}

      {step === "face" && <FaceCheck onDone={faceDone} />}

      {step === "done" && (
        <PhoneState icon={hasEdits && !autoApprove ? "clock" : "check"} title={hasEdits && !autoApprove ? "Submitted for approval" : "You're registered"}>
          <p className="muted">
            {hasEdits && !autoApprove
              ? "Your lecturer will check your details. You can mark attendance once approved."
              : "Use the attendance link your lecturer shares each week."}
          </p>
          <p className="muted small">You can close this tab.</p>
        </PhoneState>
      )}
    </main>
  );
}
