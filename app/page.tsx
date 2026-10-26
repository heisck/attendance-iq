import Link from "next/link";

// UI review index for the mock phase. Becomes a redirect to /login once the backend lands.
const SCREENS: [string, string, string][] = [
  ["Lecturer", "/login", "Sign in"],
  ["Lecturer", "/lecturer", "Sessions dashboard"],
  ["Lecturer", "/lecturer/new", "New session form + link"],
  ["Lecturer", "/lecturer/session/s3", "Live session (QR, count, phones)"],
  ["Lecturer", "/lecturer/session/s4", "Session not started yet"],
  ["Lecturer", "/lecturer/approvals", "Approvals (twins + edits)"],
  ["Lecturer", "/lecturer/courses/c1", "Course results, roster, CSV"],
  ["Student", "/s/s3", "Attendance: scan, index, face, done, node"],
  ["Student", "/s/s3?outcome=expired", "Attendance: expired QR"],
  ["Student", "/s/s3?outcome=nomatch", "Attendance: face doesn't match"],
  ["Student", "/s/s3?outcome=already", "Attendance: already marked"],
  ["Student", "/s/s4", "Registration: not open yet"],
  ["Student", "/s/s2", "Link closed"],
  ["Student", "/s/reg", "Registration: name lookup, edits, face"],
];

export default function Index() {
  return (
    <main className="page page-narrow">
      <h1>Screens (mock data)</h1>
      <p className="muted">
        Student screens need a phone, or browser dev tools in a phone size. Set <span className="mono">NEXT_PUBLIC_DEV_ALLOW_DESKTOP=true</span> in{" "}
        <span className="mono">.env.local</span> to skip the phone check.
      </p>
      <div className="table-wrap">
        <table>
          <tbody>
            {SCREENS.map(([who, href, label]) => (
              <tr key={href}>
                <td className="muted">{who}</td>
                <td>
                  <Link href={href}>{label}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
