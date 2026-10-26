"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";

// White blocks stacked on the ash backdrop. The active link drops its white, so the
// backdrop shows through as a band and its neighbours round off around it (see .side-* CSS).
const ICON: Record<string, ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19z" />,
  courses: <path d="M2.5 9.5 12 5l9.5 4.5L12 14zM6.5 11.7V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.3M21.5 9.5V15" />,
  history: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path d="M4.5 4.5V9H9M12 8v4.5l3 2" />
    </>
  ),
  signOut: <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14M10 8l-4 4 4 4M6 12h10" />,
};

const SWIPE = 40;

function Item({ href, icon, label, active }: { href: string; icon: string; label: string; active?: boolean }) {
  return (
    <Link href={href} className="side-block side-link" aria-current={active ? "page" : undefined} title={label}>
      <span className="side-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {ICON[icon]}
        </svg>
      </span>
      <span className="side-label">{label}</span>
    </Link>
  );
}

// Two widths: rail (icons) and full (labels). Desktop always shows it; below 1024px it is
// hidden behind the corner tab, which opens the rail; then the logo or a swipe right opens it fully.
export function Sidebar() {
  const path = usePathname();
  const [full, setFull] = useState(true);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const swiped = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function onClick(e: MouseEvent<HTMLElement>) {
    // A swipe that started on a link shouldn't also follow it.
    if (swiped.current) {
      e.preventDefault();
      swiped.current = false;
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest("a")) setOpen(false);
    // Desktop: a click on any empty part of the rail opens it fully.
    else if (!t.closest("button") && !full && matchMedia("(pointer: fine)").matches) setFull(true);
  }

  function onPointerUp(e: PointerEvent<HTMLElement>) {
    if (e.pointerType === "mouse") return;
    const dx = e.clientX - startX.current;
    swiped.current = Math.abs(dx) > SWIPE;
    if (dx > SWIPE) setFull(true);
    else if (dx < -SWIPE) {
      if (full) setFull(false);
      else setOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="nav-tab"
        aria-label="Open menu"
        aria-controls="side-nav"
        aria-expanded={open}
        onClick={() => {
          setFull(false);
          setOpen(true);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 6l-6 6 6 6" />
        </svg>
      </button>
      <div className="nav-scrim" aria-hidden="true" onClick={() => setOpen(false)} />
      {/* Sign out is a POST, so no prefetch or stray link can trigger it. */}
      <form id="sign-out" action="/api/logout" method="post" hidden />
      <nav
        id="side-nav"
        className="side"
        aria-label="Lecturer"
        data-mode={full ? "full" : "rail"}
        data-open={open || undefined}
        onClick={onClick}
        onPointerDown={(e) => {
          startX.current = e.clientX;
          swiped.current = false;
        }}
        onPointerUp={onPointerUp}
      >
        {/* The logo is the width toggle. */}
        <button type="button" className="side-block side-brand" aria-expanded={full} onClick={() => setFull(!full)}>
          <span className="side-logo">
            <Image src="/logo.svg" alt="" width={27} height={28} unoptimized priority data-logo-anchor />
          </span>
          <span className="side-label">Attendance IQ</span>
          <span className="sr-only">{full ? ", collapse menu" : ", expand menu"}</span>
        </button>
        <Item href="/lecturer" icon="home" label="Dashboard" active={path === "/lecturer" || path.startsWith("/lecturer/session")} />
        <Item href="/lecturer/courses" icon="courses" label="Courses" active={path.startsWith("/lecturer/courses")} />
        <Item href="/lecturer/history" icon="history" label="History" active={path === "/lecturer/history"} />
        <div className="side-block side-fill" />
        <button type="submit" form="sign-out" className="side-block side-link side-out" title="Sign out">
          <span className="side-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {ICON.signOut}
            </svg>
          </span>
          <span className="side-label">Sign out</span>
        </button>
      </nav>
    </>
  );
}
