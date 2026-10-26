"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent, type ToggleEvent } from "react";
import { approvals, courses, LECTURER_NAME, roster } from "@/mocks/data";

// Section pages get their title here as the h1. Deeper pages (one session, one course)
// keep their own h1 and show the section as a way back.
const TITLE: Record<string, string> = {
  "/lecturer": "Dashboard",
  "/lecturer/courses": "Courses",
  "/lecturer/history": "History",
  "/lecturer/approvals": "Approvals",
  "/lecturer/new": "New session",
};

const BELL_W = 320;
const RESULTS = 6;

const INITIALS = LECTURER_NAME.split(/\s+/)
  .map((w) => w[0])
  .join("")
  .replace(/[^A-Z]/gi, "")
  .slice(0, 2)
  .toUpperCase();

// Native popover handles Esc and click-outside; we only drop it below its button, right
// edges lined up and kept on screen (it sits in the top layer, so it can't inherit a position).
function placeBelow(e: ToggleEvent<HTMLDivElement>) {
  if (e.newState !== "open") return;
  const menu = e.currentTarget;
  const button = document.querySelector(`[popovertarget="${menu.id}"]`)!.getBoundingClientRect();
  menu.style.top = `${button.bottom + 8}px`;
  menu.style.left = `${Math.max(12, Math.min(button.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 12))}px`;
}

const closeMenu = (e: MouseEvent<HTMLElement>) => e.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();

// Dashboard search over courses (code, name) and students (name, index, student number).
// Results show while the field has focus; each opens the course it belongs to.
function Search() {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const code = (id: string) => courses.find((c) => c.id === id)!.code;
  const hits = term
    ? [
        ...courses
          .filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(term))
          .map((c) => ({ key: c.id, href: `/lecturer/courses/${c.id}`, label: c.code, meta: c.name })),
        ...roster
          .filter((r) => `${r.name} ${r.indexNo} ${r.studentNo}`.toLowerCase().includes(term))
          .map((r) => ({ key: r.id, href: `/lecturer/courses/${r.courseId}`, label: r.name, meta: `${r.indexNo} · ${code(r.courseId)}` })),
      ].slice(0, RESULTS)
    : [];

  return (
    <div role="search" className="top-search">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </svg>
      <input
        type="search"
        className="top-search-input"
        placeholder="Search"
        aria-label="Search courses or students"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQ("")}
      />
      {term && (
        <div className="search-results">
          {hits.length ? (
            hits.map((h) => (
              <Link key={h.key} href={h.href} className="bell-item" onClick={() => setQ("")}>
                <span>
                  <strong>{h.label}</strong>
                  <span className="bell-meta">{h.meta}</span>
                </span>
              </Link>
            ))
          ) : (
            <p className="search-empty">Nothing matches &ldquo;{q.trim()}&rdquo;.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const path = usePathname();
  const title = TITLE[path];
  const back = path.startsWith("/lecturer/courses/") ? ["/lecturer/courses", "Courses"] : ["/lecturer", "Dashboard"];

  return (
    <header className="top">
      {path === "/lecturer" ? (
        // The dashboard shows search where the title would be; the title stays for screen readers.
        <>
          <h1 className="sr-only">{title}</h1>
          <Search />
        </>
      ) : title ? (
        <h1 className="top-title">{title}</h1>
      ) : (
        <Link href={back[0]} className="top-back">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" />
          </svg>
          {back[1]}
        </Link>
      )}
      <div className="top-actions">
        {/* On the New session page the + turns into an x that closes it. */}
        <Link
          href={path === "/lecturer/new" ? "/lecturer" : "/lecturer/new"}
          className="top-btn top-new"
          title={path === "/lecturer/new" ? "Close" : "New session"}
          data-open={path === "/lecturer/new" || undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 6v12M6 12h12" />
          </svg>
          <span className="sr-only">{path === "/lecturer/new" ? "Close new session" : "New session"}</span>
        </Link>
        <button type="button" className="top-btn top-bell" popoverTarget="bell-menu" title="Approvals">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0" />
          </svg>
          <span className="sr-only">Approvals, {approvals.length} waiting</span>
          {approvals.length > 0 && (
            <span className="top-badge" aria-hidden="true">
              {approvals.length}
            </span>
          )}
        </button>
        <div id="bell-menu" popover="auto" className="menu bell" style={{ width: BELL_W }} onToggle={placeBelow}>
          <p className="menu-head">
            <strong>Approvals</strong>
            <span>{approvals.length ? `${approvals.length} registrations waiting on you` : "Nothing waiting"}</span>
          </p>
          {approvals.map((a) => (
            <Link key={a.id} href={`/lecturer/approvals#${a.id}`} className="bell-item" onClick={closeMenu}>
              <span className="bell-dot" data-kind={a.kind} aria-hidden="true" />
              <span>
                <strong>{a.student}</strong>
                <span className="bell-meta">
                  {a.kind === "duplicate_face" ? `Looks like ${a.matches}` : "Changed roster details"} ·{" "}
                  {courses.find((c) => c.id === a.courseId)!.code}
                </span>
              </span>
            </Link>
          ))}
          {approvals.length > 0 && (
            <Link href="/lecturer/approvals" className="btn btn-ink bell-all" onClick={closeMenu}>
              Review all
            </Link>
          )}
        </div>
        <div className="top-user" title={LECTURER_NAME}>
          <span className="top-avatar" aria-hidden="true">
            {INITIALS}
          </span>
          <span className="top-name">{LECTURER_NAME}</span>
        </div>
      </div>
    </header>
  );
}
