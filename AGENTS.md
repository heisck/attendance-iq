# Agent Operating Instructions

Short rules, read every run. Full detail: [`docs/base-rules.md`](docs/base-rules.md). Project-specific identity, palette, fonts and endpoints go in a project section appended below. Without one, apply these generic rules and do not ask for it.

## Design
* Product-specific, not AI-template. Avoid purple/blue gradients, gradient text, glassmorphism, headline badges, icon-box rows, scroll fade-ins, emojis in headings, em-dashes in marketing copy, plus the other bans in the docs.
* Choose fonts from the brand. Do not default to Inter/Space Grotesk/Instrument Serif; use them only if the brand calls for them. No dark mode unless the project asks.
* Action-first button copy. Never `Learn More`, `Click Here`, `Read Details`, `Discover More`.
* If images are used, real photography only. Colors, fonts and spacing as tokens. Honor `prefers-reduced-motion`.

## Security
* Never expose secrets. Validate input on the server. Parameterize queries. Escape user content.
* If forms or public endpoints exist: shared Zod schema, honeypot, rate limit (default 5 per 10 min per IP, `429`), body size limit (default 32KB, `413`).
* Auth, payments, uploads, AI and database-policy rules apply only if that feature exists in the code or the current task adds it (see docs). Ask before rewriting Git history or running schema changes that drop or rename data.

## Engineering
* Inspect existing code first. Reuse existing patterns. Avoid new dependencies; use the latest stable version compatible with the project when adding or updating a package; do not mass-upgrade unasked.
* Fix root causes. Keep changes small and focused; commit only when asked.

## Done
If code changed, before a commit or when finished run `npx tsc --noEmit`, `npm run lint`, `npm run build` (skip any the project lacks; pass means zero errors). Skip for docs-only or read-only tasks. Keep WCAG AA contrast and 44×44px touch targets on UI you touched. Document new features in the project's own README and docs.
