# Base Rules (Full Details)

Reference for the summary in [`AGENTS.md`](../AGENTS.md). If the two disagree, `AGENTS.md` wins. "Has a feature" means it exists in the code or the current task adds it. Sections marked "on request" or "if the project has X" apply only then.

## 1. Project Kickoff (only when asked to start a new project)

1. Create a PRD
2. Define the value proposition, pain, and ICP
3. Export the PRD to Markdown and load it into the coding agent
4. Write/maintain AGENTS.md
5. Install appropriate coding-agent plugins/tools
6. Connect GitHub and add a .gitignore
7. Generate a brand/design document
8. Lock in the technology stack
9. Set up a design system
10. Break the PRD into concrete tasks
11. Set up the database and authentication
12. Move secrets/API keys into environment variables
13. Separate staging from production
14. Add a README
15. Plan the folder/project structure
16. Add error tracking
17. Explicitly define what will NOT be built
18. Keep commits small and focused (commit only when asked)

## 2. Design & UI

Design should feel intentional, polished and product-specific, not like an AI-generated template.

**Avoid** (usage bans, not font bans where the brand chooses them): purple-to-blue gradients, gradient hero text, emojis in headings, Inter everywhere, colored-border cards, glassmorphism cards, dark mode unless the project asks for it (and never low-contrast), three icon boxes in a row, a badge above the headline, Lucide icons everywhere, fade-in-on-scroll effects, cursor-following beams, buttons that only fade on hover, inconsistent spacing, em dashes everywhere, buzzword copy, serif italic accents, the Space Grotesk + Instrument Serif pairing, grain/noise over gradients.

**Do:**
* Action-first button copy. Never `Learn More`, `Click Here`, `Read Details`, `Discover More`.
* If images are used, real photography (optimized WebP), no generic stock or cartoon art.
* Define colors, fonts and spacing once as design tokens and reuse them.
* Choose fonts from the product's brand, with clear hierarchy, consistent weights and line heights, and responsive sizing.
* Honor `prefers-reduced-motion`. No layout shift between UI states. Dialogs pause background scroll.

## 3. Security

### Always
* Never expose secrets or API keys, especially in client code. If a secret leaked, tell the user to rotate it and ask before rewriting Git history.
* Validate all input on the server. If forms exist, share Zod schemas between forms and API routes.
* Parameterize database queries. Escape/sanitize user-generated content.
* Return only necessary API data.
* Limit request/body size (`413`). Rate-limit public endpoints (`429`, default 5 per 10 min per IP).
* Honeypot `company` input on forms: if filled, fake `200 { ok: true }` and persist nothing.
* Security headers, HTTPS in production, secure cookie flags, CORS limited to trusted origins.
* Least-privilege database permissions. After schema edits, regenerate the client and push the schema (ask first only if the change drops or renames data).

### If the project has accounts or login
* Enforce authentication and authorization server-side. Lock records to authorized users. Prevent field tampering.
* Hash passwords securely. Secure session cookies. Invalidate sessions after password change.
* Rate-limit login and password-reset requests. Lock or slow accounts after repeated failures.
* Expire reset links. Do not reveal whether an account exists.
* CSRF protection where applicable.

### If the project has a database host with row-level policies (e.g. Supabase)
* Enable Row Level Security. Use public keys only where appropriate. Encrypt sensitive data.

### If the project has file uploads
* Whitelist file types and restrict size.

### If the project takes payments
* Verify webhooks. Set and validate prices server-side.

### If the project uses AI features
* Guard against prompt injection. Cap and control usage.

### If the project is deployed publicly
* Run a dependency vulnerability scan (`npm audit`) before launch or on request. Add HSTS. Disable directory listing. Remove default/admin routes. Log important security events.

## 4. Engineering

* Inspect the existing architecture before changing it. Preserve existing behavior unless asked.
* Reuse the established design system and patterns. Keep spacing, typography and interactions consistent.
* Avoid unnecessary dependencies. Use the latest stable version compatible with the project when adding or updating a package (`npm view <pkg> version`; skip if offline); do not mass-upgrade unasked.
* Do not blindly accept generated code. Keep components modular.
* Fix root causes, not symptoms. Keep commits small and focused.

## 5. Review Checklist (on request)

When asked to review, look for: vibecoded visual patterns, inconsistent UI, security holes, exposed secrets, weak auth, unsafe database access, unvalidated input, poor accessibility, broken responsive behavior, duplicate logic, unnecessary complexity, missing error handling.

## 6. Done

Before a commit or when the task is finished (not after every small edit). Skip scripts the project lacks; pass means zero errors:

- [ ] If code changed: `npx tsc --noEmit`, `npm run lint` and `npm run build` pass (skip for docs-only or read-only tasks)
- [ ] Text meets WCAG AA contrast (4.5:1 body, 3:1 large)
- [ ] Interactive elements you touched are at least 44×44px
- [ ] New features are documented in the project's own README and docs (not in this template's files)
