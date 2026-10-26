"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FaceLine } from "@/components/FaceLine";
import { QrPasswordField } from "@/components/QrPasswordField";
import { RESET_URL } from "@/lib/resetUrl";

// Mock: any credentials work. Real check compares against LECTURER_EMAIL and
// LECTURER_PASSWORD on the server.

export default function Login() {
  const router = useRouter();
  return (
    <div className="signin">
      <main className="signin-main">
        <div className="signin-sheet">
          <div className="signin-tabrow">
            <div className="signin-tab">
              <Image
                src="/logo.svg"
                alt=""
                width={39}
                height={40}
                unoptimized
                priority
                className="signin-logo"
                data-logo-anchor
              />
            </div>
            <span className="signin-name">Attendance IQ</span>
          </div>
          <header className="signin-head">
            <h1 className="signin-title">Welcome back</h1>
            <p className="signin-lede">Sign in to the lecturer dashboard.</p>
          </header>
          <form
            className="signin-panel"
            onSubmit={(e) => {
              e.preventDefault();
              router.push("/lecturer");
            }}
          >
            <div className="signin-brand">
              <Image src="/logo.svg" alt="" width={27} height={28} unoptimized priority data-logo-anchor />
              Attendance IQ
            </div>
            <div className="pill-field">
              <svg className="pill-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="M4 7.5l8 5.5 8-5.5" />
              </svg>
              <input
                id="email"
                name="email"
                type="email"
                className="pill-input"
                placeholder=" "
                autoComplete="email"
                required
                autoFocus
              />
              <label htmlFor="email" className="pill-label">
                Email
              </label>
            </div>
            <QrPasswordField id="password" label="Password" />
            <a className="signin-forgot" href={RESET_URL} target="_blank" rel="noopener noreferrer">
              Forgot password?
            </a>
            <button className="btn btn-ink btn-block">Unlock</button>
          </form>
        </div>
      </main>
      <aside className="signin-art" aria-hidden="true">
        <FaceLine className="signin-face" />
      </aside>
    </div>
  );
}
