// The lecturer password lives in the Vercel project's env vars, so "forgot" or "change"
// means editing it there: only someone who can sign in to that Vercel account can.
export const RESET_URL = process.env.NEXT_PUBLIC_PASSWORD_RESET_URL || "https://vercel.com/dashboard";
