# Security model — a core mission, not an afterthought

Principle: **secure by design, private by default, auditable always.** An open university for a
global community (including people in places where their faith or speech may be sensitive) must
protect its learners.

## Identity & access
- SSO/OAuth2 + OIDC; strong password policy; **MFA available to all, required for staff/scholars/admins**.
  - **Implemented**: RFC 6238 TOTP, zero dependencies (Web Crypto only — `functions/api/_totp.js`).
    Available to every role and enforced for anyone enrolled: an enrolled user's session must
    clear `/mfa` (`mfa_ok=1`) before `requireMfa` in `_lib.js` lets it through, whatever their
    role. Enrollment is *not* a login-time block for admins (changed 2026-09-10 — the previous
    `403 mfa_enrollment_required` left a newly-added admin email unable to do anything at all
    until an authenticator was set up, with no path out of it in the UI). **Accepted risk**:
    a stolen session cookie belonging to an un-enrolled admin now reaches every `/api/admin/*`
    route with no second factor, so admins are expected to enroll from `/mfa` — it is policy
    rather than code. Re-tightening is a one-line revert of the removed `user.role === "admin"`
    branch in `requireMfa`. Teachers are likewise on a grace period — enrollment stays a
    precondition for high-trust studio actions (draft submission, profile publish) rather than
    a login-time block. 10 backup codes per enrollment (SHA-256 hashed, single-use); 5
    failed verify attempts on one session forces a fresh magic-link sign-in. Break-glass
    (sole-admin lockout) and the admin `mfa_reset` action are documented in OPERATIONS.md.
- **Least-privilege RBAC**: learner / scholar-author / reviewer / admin — scoped capabilities, no shared admin accounts.
  - **Implemented**: `reviewer` is a `user_flags` row, not a `role` value — deliberately, so a
    scholar-verified teacher can hold `teacher` + `reviewer` simultaneously (a single-valued
    role column can't express that), and so it never interacts with the ADMIN_EMAILS-driven
    admin demotion logic in `verify.js`. Sikhi-topic course drafts additionally require the
    deciding reviewer to be scholar-verified (or admin) — see `functions/api/review/decision.js`.
- Session hardening: short-lived tokens, secure+httpOnly+SameSite cookies, idle/absolute timeouts.

## Data protection & privacy
- **TLS 1.3 everywhere**; HSTS. Encryption at rest for DBs, backups, and object storage.
- **Data minimization** — collect only what's needed; no selling/ad-tracking; clear privacy policy.
- GDPR-style rights: export & delete my data; cookie consent; regional data considerations.
- PII segregated; secrets in a vault (never in code/images); rotation policy.

## Application security
- Secure SDLC: dependency scanning (SCA), SAST/DAST in CI, image scanning, signed builds.
- OWASP Top 10 controls; strict input validation/output encoding; CSP, anti-CSRF, rate limiting.
- **Minimize the plugin/attack surface** — a key reason we don't fork a plugin-heavy LMS;
  vet every xBlock/extension; pin and review dependencies.
- Coordinated **vulnerability disclosure** (security.txt + a reporting address); track upstream
  Open edX security advisories and patch promptly.

## Infrastructure & operations
- Container isolation (Tutor/Docker); network segmentation; WAF + DDoS protection at the edge (CDN).
- Centralized logging + audit trail (who changed which course/role/data); tamper-evident.
- Automated, **encrypted, tested backups**; documented disaster recovery (RPO/RTO targets).
- IaC with reviewed changes; no manual prod edits; staging mirrors prod.

## Content integrity & trust & safety
- Course publishing requires review (esp. doctrinal accuracy via the scholar board).
- Moderated discussions; abuse reporting; anti-spam.
- Provenance/attribution preserved for all imported open content.

## Governance
- Annual third-party pen test + ongoing automated scanning.
- Incident response runbook; breach notification process.
- Public **SECURITY.md / security.txt** with how to report issues responsibly.
