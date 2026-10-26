import type { InputHTMLAttributes, ReactNode } from "react";

// Sign-in style pill: leading icon, label floats once there's a value. Text inputs need
// placeholder=" " so the label can tell empty from filled.
export function PillField({ id, label, icon, ...input }: { id: string; label: string; icon: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="pill-field">
      <svg className="pill-icon" viewBox="0 0 24 24" aria-hidden="true">
        {icon}
      </svg>
      <input id={id} className="pill-input" {...input} />
      <label htmlFor={id} className="pill-label">
        {label}
      </label>
    </div>
  );
}
