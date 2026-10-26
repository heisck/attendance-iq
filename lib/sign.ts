import { createHmac, timingSafeEqual } from "node:crypto";

// Everything signed here uses APP_SECRET, with a different prefix per purpose so a value
// signed for one use can never pass as another.

function mac(data: string, len = 22) {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) throw new Error("APP_SECRET must be set (32+ characters)");
  return createHmac("sha256", secret).update(data).digest("base64url").slice(0, len);
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Lecturer sign-in: email and password from env. Compared as MACs so length and content leak no timing.
export function checkLogin(email: string, password: string) {
  const { LECTURER_EMAIL: e, LECTURER_PASSWORD: p } = process.env;
  if (!e || !p) return false;
  const okEmail = same(mac(`login.${email.trim().toLowerCase()}`), mac(`login.${e.trim().toLowerCase()}`));
  const okPassword = same(mac(`login.${password}`), mac(`login.${p}`));
  return okEmail && okPassword;
}

// Lecturer cookie: "<expiry ms>.<mac>". The MAC covers the env email and password, so changing
// either signs every device out.
export const COOKIE = "aiq_lecturer";
export const COOKIE_MAX_AGE_S = 7 * 24 * 3600;
const cookieMac = (exp: string) => mac(`lecturer.${exp}.${process.env.LECTURER_EMAIL}.${process.env.LECTURER_PASSWORD}`, 43);

export function lecturerCookie(now = Date.now()) {
  const exp = String(now + COOKIE_MAX_AGE_S * 1000);
  return `${exp}.${cookieMac(exp)}`;
}

export function isLecturerCookie(value: string | undefined, now = Date.now()) {
  const [exp, sig] = (value ?? "").split(".");
  return Number(exp) > now && !!sig && same(sig, cookieMac(exp));
}

// QR code: "<session>.<node>.<server seconds>.<mac>". Stateless: making or checking one needs no storage.
// Accepted if the server issued it at most CODE_MAX_AGE_S ago by its own clock.
export const CODE_MAX_AGE_S = 3;

export function makeCode(sessionId: string, node: string, now = Date.now()) {
  const body = `${sessionId}.${node}.${Math.floor(now / 1000)}`;
  return `${body}.${mac(`code.${body}`)}`;
}

export function readCode(code: string, sessionId: string, now = Date.now()) {
  const parts = code.split(".");
  if (parts.length !== 4 || parts[0] !== sessionId) return null;
  const [, node, t, sig] = parts;
  // t is floored to the second, so a code issued 3.9 s ago reads as 3 s + a fraction.
  const age = now / 1000 - Number(t);
  if (!(age > -1 && age < CODE_MAX_AGE_S + 1)) return null;
  return same(sig, mac(`code.${sessionId}.${node}.${t}`)) ? node : null;
}

// Node token: proof that this tab marked someone in this session, so it may show codes and mark
// the next person without scanning again.
export const nodeToken = (sessionId: string, node: string) => `${node}.${mac(`node.${sessionId}.${node}`)}`;

export function readNodeToken(token: string, sessionId: string) {
  const [node, sig] = token.split(".");
  return node && sig && same(sig, mac(`node.${sessionId}.${node}`)) ? node : null;
}
