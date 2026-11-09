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

// QR codes (format in lib/code.ts) are made by each screen with its node's QR key, and checked here.
// Accepted if made at most CODE_MAX_AGE_S ago by the server's clock. Stateless: no storage either way.
export const CODE_MAX_AGE_S = 3;
export const qrKey = (sessionId: string, node: string) => mac(`qr.${sessionId}.${node}`, 43);

export function readCode(code: string, sessionId: string, now = Date.now()) {
  const parts = code.split(".");
  if (parts.length !== 4 || parts[0] !== sessionId) return null;
  const [, node, t, sig] = parts;
  // t is floored to the second, so a code made 3.9 s ago reads as 3 s + a fraction.
  const age = now / 1000 - Number(t);
  if (!node || !(age > -1 && age < CODE_MAX_AGE_S + 1)) return null;
  const want = createHmac("sha256", qrKey(sessionId, node)).update(`code.${sessionId}.${node}.${t}`).digest("base64url").slice(0, 22);
  return same(sig, want) ? node : null;
}

// Node token: proof that this tab marked someone in this session, so every next person it marks
// (each still scanning a live code first) counts under the same phone.
export const nodeToken = (sessionId: string, node: string) => `${node}.${mac(`node.${sessionId}.${node}`)}`;

export function readNodeToken(token: string, sessionId: string) {
  const [node, sig] = token.split(".");
  return node && sig && same(sig, mac(`node.${sessionId}.${node}`)) ? node : null;
}

// A value its holder can read but not change: "<base64url JSON>.<mac>". Used for scan tickets, so they
// need no storage until redeemed.
export function seal(purpose: string, data: object) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${mac(`${purpose}.${body}`)}`;
}

export function unseal<T>(purpose: string, value: string): T | null {
  const [body, sig] = value.split(".");
  if (!body || !sig || !same(sig, mac(`${purpose}.${body}`))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}
