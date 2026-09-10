// Shared account-creation bits for the two paths that can create a user:
// POST /api/auth/signup (the form) and GET /api/auth/sso (first landing from
// sikhi.io). Both must persist the marketing opt-in the same way and send the
// same welcome email exactly once, so the logic lives here rather than being
// written twice and drifting.

import { welcomeTemplate } from "../../_email-templates.js";

/**
 * INSERT a new user, carrying the marketing opt-in.
 *
 * The opt-in write is wrapped: `users.marketing_optin` ships in schema.sql but
 * has to be applied to the live D1 by hand (see the ALTER comment there), and
 * a deploy that lands before that ALTER would otherwise 500 every signup on
 * "no such column". Degrading to an INSERT without the column loses the
 * consent value for that one account -- recoverable, and visible in the log --
 * whereas failing the INSERT loses the account.
 *
 * Deliberately NOT a blanket try/catch around the whole INSERT: a UNIQUE
 * violation or a genuinely broken DB must still throw. Only the
 * missing-column case is retried, and only once.
 */
export async function insertUserWithOptin(env, { id, email, name, role, createdAt, marketing, passwordHash, username, emailVerified = false }) {
  const optin = marketing === true ? 1 : 0;
  // `username` is only ever supplied by register-complete.js. SSO provisioning
  // never sets one: usernames are per-site (migrations/0012), so a hub user's
  // sikhi.io handle is not theirs here, and guessing one for them would be
  // inventing identity. Those rows keep NULL, which the UNIQUE index allows.
  const cols = ["id", "email", "name", "role", "created_at"];
  const vals = [id, email, name, role, createdAt];
  if (emailVerified) { cols.push("email_verified"); vals.push(1); }
  if (passwordHash !== undefined) { cols.push("password_hash"); vals.push(passwordHash); }
  if (username !== undefined && username !== null) { cols.push("username"); vals.push(username); }

  const build = (extraCols, extraVals) => {
    const allCols = [...cols, ...extraCols];
    return {
      sql: `INSERT INTO users (${allCols.join(", ")}) VALUES (${allCols.map(() => "?").join(",")})`,
      args: [...vals, ...extraVals],
    };
  };

  const withOptin = build(["marketing_optin"], [optin]);
  try {
    await env.DB.prepare(withOptin.sql).bind(...withOptin.args).run();
    return { optinPersisted: true };
  } catch (e) {
    const message = (e && e.message) || String(e);
    if (!/marketing_optin|no such column/i.test(message)) throw e;
    console.log("[onboarding] users.marketing_optin missing — run the ALTER in schema.sql; continuing without it");
    const noOptin = build([], []);
    await env.DB.prepare(noOptin.sql).bind(...noOptin.args).run();
    return { optinPersisted: false };
  }
}

/**
 * Send the one-per-account welcome email. Never throws, never blocks: the
 * account already exists by the time this runs, so a Resend outage must not
 * change the response. Uses the Pages Function context's waitUntil where
 * available so the send survives the response being flushed. No retry loop.
 *
 * Same send shape and env handling as forgot-password.js.
 */
export function sendWelcomeEmail(context, email, name) {
  const { env } = context;
  if (!env.RESEND_API_KEY) {
    console.log("welcome: RESEND_API_KEY not configured for", email);
    return;
  }
  const t = welcomeTemplate(name || undefined);
  const p = fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "Sikhi University <login@sikhiuni.com>",
      to: [email],
      reply_to: env.REPLY_TO || "contact@sikhism.io",
      subject: t.subject,
      text: t.text,
      html: t.html,
    }),
  }).catch((e) => { console.log("Resend threw (welcome)", e && e.message); });

  if (typeof context.waitUntil === "function") context.waitUntil(p);
}
