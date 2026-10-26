"use client";

import { useEffect, useRef, useState } from "react";
import { FaceCheck } from "@/components/FaceCheck";
import { PhoneHead, PhoneState } from "@/components/Phone";
import { PillField } from "@/components/PillField";
import { post } from "@/lib/post";
import { FIELDS as LABELS, studentFields, type Field, type Step as Move } from "@/lib/schemas";

// A roster suggestion: the name in full, everything else masked by the server.
type Suggestion = Record<Field, string> & { id: string };
const SEARCH_DELAY_MS = 250;
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


export function Register({ title, sessionId, autoApprove }: { title: string; sessionId: string; autoApprove: boolean }) {
  const [step, setStep] = useState<"details" | "face" | "done" | "closed">("details");
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [values, setValues] = useState(EMPTY);
  const [editing, setEditing] = useState<Record<Field, boolean>>({ name: true, email: true, studentNo: true, indexNo: true });
  const [consent, setConsent] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ticket, setTicket] = useState<{ ticket: string; challenge: Move[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const company = useRef("");

  // Server-side search: 3+ letters, up to 5 unregistered names.
  const query = picked ? "" : values.name.trim();
  useEffect(() => {
    if (query.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/s/${sessionId}/roster?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setSuggestions, () => undefined);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, sessionId]);
  const shown = query.length >= 3 ? suggestions : [];

  function pick(r: Suggestion) {
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

  const keys = Object.keys(EMPTY) as Field[];
  const hasEdits = !picked || keys.some((f) => editing[f]);
  const complete = keys.every((f) => values[f].trim()) && consent;
  // Picked from the roster: send only what was retyped. Not listed: send everything.
  const typed = Object.fromEntries(keys.filter((f) => !picked || editing[f]).map((f) => [f, values[f]]));

  async function submitDetails(form: HTMLFormElement) {
    const check = studentFields.partial().safeParse(typed);
    if (!check.success) return setError(check.error.issues[0].message);
    company.current = String(new FormData(form).get("company") ?? "");
    setBusy(true);
    const r = await post(`/api/s/${sessionId}/ticket`, {});
    setBusy(false);
    if (r.status === 410) return setStep("closed");
    if (!r.ok) return setError(r.error);
    setError("");
    setTicket(r.data);
    setStep("face");
  }

  async function faceDone(frames: string[]) {
    const r = await post(`/api/s/${sessionId}/register`, { ticket: ticket!.ticket, rosterId: picked?.id, fields: typed, frames, company: company.current });
    if (r.status === 410) return setStep("closed");
    if (!r.ok) {
      setError(r.error);
      return setStep("details");
    }
    setPending(r.data.status === "pending");
    setStep("done");
  }

  if (step === "closed")
    return (
      <main className="phone">
        <PhoneHead title={title} />
        <PhoneState icon="lock" title="Registration has closed">
          <p className="muted">Ask your lecturer when the next registration opens.</p>
        </PhoneState>
      </main>
    );

  return (
    <main className="phone">
      <PhoneHead title={title} steps={3} at={["details", "face", "done"].indexOf(step)} />

      {step === "details" && (
        <form
          style={{ display: "contents" }}
          onSubmit={(e) => {
            e.preventDefault();
            submitDetails(e.currentTarget);
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
                      {values[field]}
                    </span>
                    <span className="pill-label">{LABELS[field]}</span>
                    <button type="button" className="pill-eye pill-change" onClick={() => edit(field)} aria-label={`Change ${LABELS[field]}`}>
                      Change
                    </button>
                  </div>
                )}
                {field === "name" && shown.length > 0 && (
                  <ul className="suggest" aria-label="Matching names">
                    {shown.map((r) => (
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

            {error && (
              <p className="notice notice-danger" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="phone-foot">
            <button className="btn btn-ink btn-block" disabled={!complete || busy}>
              {busy ? "One moment…" : "Continue to face check"}
            </button>
          </div>
        </form>
      )}

      {step === "face" && ticket && <FaceCheck challenge={ticket.challenge} onFrames={faceDone} />}

      {step === "done" && (
        <PhoneState icon={pending ? "clock" : "check"} title={pending ? "Submitted for approval" : "You're registered"}>
          <p className="muted">
            {pending
              ? "Your lecturer will check your details. You can mark attendance once approved."
              : "Use the attendance link your lecturer shares each week."}
          </p>
          <p className="muted small">You can close this tab.</p>
        </PhoneState>
      )}
    </main>
  );
}
