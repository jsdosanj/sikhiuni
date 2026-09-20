// Email templates for sikhiuni.com.
//
// SCOPE, 2026-09-06: a WELCOME email now exists (welcomeTemplate) and is sent
// once per account on creation -- by explicit user instruction, which
// SUPERSEDES the 2026-09-03 "Resend is reserved for forgot-password only"
// cost directive that used to head this file. Recorded here so a future
// session doesn't retire it as a cost regression: the volume is bounded at
// exactly one send per account, ever.
//
// LATER THE SAME DAY (2026-09-06): registration became username + emailed
// 6-digit code, so registrationCodeTemplate below is now the single email a
// NATIVE signup receives -- the welcome copy is fused into it. welcomeTemplate
// survives because it is still the one-time email for a sikhi.io user first
// provisioned here by SSO, who never sees a code. Magic-link sign-in and its
// template are GONE (see functions/api/auth/request.js for why).
//
// Design by Fable (claude-fable-5), 2026-09-03, briefed on this site's real
// brand tokens (web/tailwind.config.mjs: navy #0b2444/#0b1e3a, brand navy
// #16335c, saffron/gold #f4b21a/#ffc83d, Source Serif 4 display -> Georgia
// email-safe fallback). {{RESET_LINK}} substituted at send time.
//
// Every template ends with POWERED_BY_HTML, the cross-site family mark that
// sikhi.io and punjabiuni.com render identically. Deliberately not a shared
// package -- three repos, three deploy pipelines -- so test/email-templates.
// test.ts pins the exact wording here, as its twin does in each sibling repo.

// {MUTED} = #5f7396 and {ACCENT} = #ffc83d: the two colours that read
// correctly on this site's navy footer band.
export const POWERED_BY_HTML = `<div style="font-family:Helvetica,Arial,sans-serif; font-size:11px; line-height:17px; color:#5f7396; padding-top:12px; text-align:center;">
  Powered by <a href="https://sikhi.io" target="_blank" style="color:#ffc83d; text-decoration:none; font-weight:600;">sikhi.io</a>
</div>`;

// ── Password reset code ─────────────────────────────────────────────────────
// CONVERGED 2026-09-06 from resetPasswordTemplate's clickable link to a
// 6-digit code, matching sikhi.io and punjabiuni.com. A link is a bearer
// credential: it signs in whatever device opens the mail (often the phone,
// not the desktop browser the user is actually locked out of), and anyone who
// can read the mailbox holds a working password change. The code only works
// when typed back into the SAME browser tab that asked for it, proven by the
// psid cookie in functions/api/auth/forgot-password.js.
//
// Do not "improve" this back into a button. The old link-based
// resetPasswordTemplate and its reset-password.js grace-window branch were
// removed 2026-09-07, once an hour had comfortably passed since the deploy
// that converged this flow onto codes.
export function resetCodeTemplate(code) {
  const html = shell({
    title: "Your Sikhi University reset code",
    preheader: `${code} is your Sikhi University password reset code. It expires in 15 minutes.`,
    eyebrow: "Account security",
    heading: "Your reset code",
    bodyRows: `
      ${paragraph("Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh.", 10)}
      ${paragraph("Enter this code in the browser tab where you asked to reset your password:", 20)}
      <tr>
        <td align="center" style="padding-bottom:26px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" bgcolor="#f7f5ef" style="background-color:#f7f5ef; border:1px solid #e4d9b4; border-radius:6px; padding:18px 30px; font-family:Helvetica,Arial,sans-serif; font-size:32px; line-height:38px; font-weight:bold; letter-spacing:8px; color:#0b1e3a;">${code}</td>
            </tr>
          </table>
        </td>
      </tr>
      ${paragraph("The code only works in that same tab &mdash; opening this email on another device won&rsquo;t change anyone&rsquo;s password.", 20)}
      <tr>
        <td bgcolor="#f7f5ef" style="background-color:#f7f5ef; border-left:3px solid #f4b21a; border-radius:0 4px 4px 0; padding:16px 20px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; line-height:21px; color:#454b56;">
          <strong style="color:#0b1e3a;">For your security:</strong> this code expires in <strong style="color:#0b1e3a;">15 minutes</strong>. If you did not ask to reset your password, no action is required &mdash; your current password remains unchanged.
        </td>
      </tr>
    `,
    footerNote: "This message was sent because a password reset was requested for your Sikhi University account.",
  });

  const text = `SIKHI UNIVERSITY — Your reset code

Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh.

Your password reset code: ${code}

Enter it in the browser tab where you asked to reset your password. The code only works in that same tab — opening this email on another device won't change anyone's password.

For your security:
- This code expires in 15 minutes.
- If you did not ask to reset your password, no action is required — your current password remains unchanged.

Respectfully,
Office of the Registrar
Sikhi University

Sikhi University · sikhiuni.com

Powered by sikhi.io — https://sikhi.io`;

  return { subject: `${code} is your Sikhi University reset code`, html, text };
}

// ── Shared shell ────────────────────────────────────────────────────────────
// New templates use the shell below.
//
// Conventions that are load-bearing, not decoration: table layout with
// role="presentation" (a screen reader must not announce the layout
// scaffolding as a data table), inline styles only (Gmail and Outlook strip
// <style>), bgcolor attributes beside every background-color (Outlook drops
// the CSS), a hidden preheader span, and mso/apple meta tags so Outlook and
// iOS Mail don't reflow the card.
function shell({ title, preheader, eyebrow, heading, bodyRows, footerNote }) {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f3ee;" bgcolor="#f4f3ee">

  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;font-size:1px;line-height:1px;mso-hide:all;">${preheader}</span>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f3ee" style="background-color:#f4f3ee;">
    <tr>
      <td align="center" style="padding:36px 16px 48px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px;">

          <tr>
            <td bgcolor="#f4b21a" style="background-color:#f4b21a; height:6px; line-height:6px; font-size:0; border-radius:8px 8px 0 0;">&nbsp;</td>
          </tr>

          <tr>
            <td bgcolor="#0b2444" align="center" style="background-color:#0b2444; padding:30px 28px 26px 28px;">
              <div style="font-family:Georgia,'Times New Roman',serif; font-size:34px; line-height:40px; color:#ffc83d;">&#9772;</div>
              <div style="font-family:Georgia,'Times New Roman',serif; font-size:21px; line-height:28px; letter-spacing:4px; color:#ffffff; text-transform:uppercase; padding-top:10px;">Sikhi University</div>
              <div style="font-family:Helvetica,Arial,sans-serif; font-size:11px; line-height:16px; letter-spacing:2px; color:#8fa3c0; text-transform:uppercase; padding-top:6px;">sikhiuni.com</div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff; border-left:1px solid #e4e1d6; border-right:1px solid #e4e1d6; padding:40px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${eyebrow ? `<tr><td style="font-family:Helvetica,Arial,sans-serif; font-size:11px; line-height:16px; letter-spacing:2px; text-transform:uppercase; color:#8a7a4e; padding-bottom:10px;">${eyebrow}</td></tr>` : ""}
                <tr>
                  <td style="font-family:Georgia,'Times New Roman',serif; font-weight:normal; font-size:25px; line-height:33px; color:#0b1e3a; padding-bottom:14px;">${heading}</td>
                </tr>
                <tr>
                  <td style="padding-bottom:22px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="44" bgcolor="#f4b21a" style="background-color:#f4b21a; height:3px; line-height:3px; font-size:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${bodyRows}
                <tr>
                  <td style="font-family:Georgia,'Times New Roman',serif; font-size:15px; line-height:24px; color:#333a45; padding-top:28px;">
                    Respectfully,<br>
                    <span style="color:#16335c;">Office of the Registrar &mdash; Sikhi University</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td bgcolor="#0b1e3a" align="center" style="background-color:#0b1e3a; border-radius:0 0 8px 8px; padding:22px 28px;">
              <div style="font-family:Georgia,'Times New Roman',serif; font-size:14px; line-height:20px; letter-spacing:2px; color:#ffc83d; text-transform:uppercase;">Sikhi University</div>
              <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; line-height:19px; color:#8fa3c0; padding-top:6px;">sikhiuni.com</div>
              <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:11px; line-height:17px; color:#5f7396; padding-top:10px;">${footerNote}</div>
              ${POWERED_BY_HTML}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

function paragraph(text, paddingBottom = 22) {
  return `<tr><td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; line-height:24px; color:#333a45; padding-bottom:${paddingBottom}px;">${text}</td></tr>`;
}

function button(href, label) {
  return `<tr>
    <td align="center" style="padding-bottom:28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" bgcolor="#f4b21a" style="background-color:#f4b21a; border-radius:4px; mso-padding-alt:14px 44px;">
            <a href="${href}" target="_blank" style="display:inline-block; padding:14px 44px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; line-height:20px; font-weight:bold; color:#0b1e3a; text-decoration:none; border-radius:4px;">${label}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ── Welcome ─────────────────────────────────────────────────────────────────
// Sent once, on account creation (password signup OR first SSO provision).
// Transactional: it says what the account is and points at it. No marketing
// content -- marketing_optin governs FUTURE sends, not this one.
export function welcomeTemplate(name) {
  const greeting = name ? `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh &mdash; and welcome, ${name}.` : "Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh.";
  const highlight = (label, detail) =>
    `<tr><td style="padding-bottom:14px;">
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
         <tr>
           <td width="4" bgcolor="#f4b21a" style="background-color:#f4b21a; font-size:0; line-height:0;">&nbsp;</td>
           <td style="padding-left:14px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; line-height:23px; color:#333a45;">
             <strong style="color:#0b1e3a;">${label}</strong><br>${detail}
           </td>
         </tr>
       </table>
     </td></tr>`;

  const html = shell({
    title: "Welcome to Sikhi University",
    preheader: "Your enrollment is complete — the full course catalogue is open to you.",
    eyebrow: "Office of the Registrar",
    heading: "Welcome to Sikhi University",
    bodyRows: `
      ${paragraph(greeting, 10)}
      ${paragraph("Your enrollment is complete. Every course on this campus is open to you, at no cost, from today.", 24)}
      ${highlight("A full departments catalogue", "Browse by department and take any course in any order — nothing is gated behind a prerequisite you haven&rsquo;t met.")}
      ${highlight("Free courses, real certificates", "Complete a course, pass its assessment, and a verifiable certificate is issued in your name.")}
      ${highlight("Learning paths", "Follow a structured route through a subject instead of choosing every next step yourself.")}
      <tr><td style="padding-bottom:6px;">&nbsp;</td></tr>
      ${button("https://sikhiuni.com/dashboard.html", "Go to your dashboard")}
      ${paragraph("Your Sikhi University sign-in also works on <strong style=\"color:#0b1e3a;\">sikhi.io</strong> and <strong style=\"color:#0b1e3a;\">PunjabiUni</strong> &mdash; one account across all three.", 0)}
    `,
    footerNote: "You&rsquo;re receiving this because an account was created for you on Sikhi University. This is a one-off message about your account.",
  });

  const text = `SIKHI UNIVERSITY — Welcome

${name ? `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh — and welcome, ${name}.` : "Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh."}

Your enrollment is complete. Every course on this campus is open to you, at no cost, from today.

- A full departments catalogue: browse by department and take any course in any order.
- Free courses, real certificates: pass a course's assessment and a verifiable certificate is issued in your name.
- Learning paths: follow a structured route through a subject.

Go to your dashboard: https://sikhiuni.com/dashboard.html

Your Sikhi University sign-in also works on sikhi.io and PunjabiUni — one account across all three.

Respectfully,
Office of the Registrar
Sikhi University

Sikhi University · sikhiuni.com
You're receiving this because an account was created for you on Sikhi University.

Powered by sikhi.io — https://sikhi.io`;

  return { subject: "Welcome to Sikhi University", html, text };
}

// ── Registration confirmation code ──────────────────────────────────────────
// THE email a new native signup receives — and the only one.
//
// 2026-09-06: registration became username + email -> emailed 6-digit code ->
// code + password in the same browser (functions/api/auth/register-*.js). The
// account does not exist when this sends, so this email is simultaneously the
// confirmation and the welcome — the welcome copy is fused in below rather
// than sent as a second message. The user's rule is that auth mail is only
// "forgot password and initial email confirmation"; a code email followed by
// a welcome email is one email too many.
//
// welcomeTemplate() is NOT retired: it is still the one-time email sent when
// a sikhi.io user is first provisioned here by SSO (functions/api/auth/sso.js
// -> _onboarding.js), which is a genuinely different reader — they never see
// a code because they never typed a password here.
//
// A CODE, never a link: a link is a bearer credential that signs in whatever
// device opens the mail. The code is useless without the httpOnly rsid cookie
// held by the browser that started the sign-up.
export function registrationCodeTemplate(code, username) {
  const greeting = username
    ? `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh &mdash; and welcome, ${username}.`
    : "Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh.";

  const codeBlock = `<tr>
    <td align="center" style="padding-bottom:26px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" bgcolor="#f7f5ef" style="background-color:#f7f5ef; border:1px solid #e4d9b4; border-radius:6px; padding:18px 30px; font-family:Helvetica,Arial,sans-serif; font-size:32px; line-height:38px; font-weight:bold; letter-spacing:8px; color:#0b1e3a;">${code}</td>
        </tr>
      </table>
    </td>
  </tr>`;

  const highlight = (label, detail) =>
    `<tr><td style="padding-bottom:14px;">
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
         <tr>
           <td width="4" bgcolor="#f4b21a" style="background-color:#f4b21a; font-size:0; line-height:0;">&nbsp;</td>
           <td style="padding-left:14px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; line-height:23px; color:#333a45;">
             <strong style="color:#0b1e3a;">${label}</strong><br>${detail}
           </td>
         </tr>
       </table>
     </td></tr>`;

  const html = shell({
    title: "Your Sikhi University confirmation code",
    preheader: `${code} is your Sikhi University confirmation code. It expires in 15 minutes.`,
    eyebrow: "Office of the Registrar",
    heading: "Confirm your enrollment",
    bodyRows: `
      ${paragraph(greeting, 10)}
      ${paragraph("Enter this code in the browser tab where you started signing up, then choose a password:", 20)}
      ${codeBlock}
      ${paragraph("The code only works in that same tab &mdash; opening this email on another device won&rsquo;t sign anyone in. It expires in <strong style=\"color:#0b1e3a;\">15 minutes</strong>.", 24)}
      ${highlight("A full departments catalogue", "Browse by department and take any course in any order &mdash; nothing is gated behind a prerequisite you haven&rsquo;t met.")}
      ${highlight("Free courses, real certificates", "Complete a course, pass its assessment, and a verifiable certificate is issued in your name.")}
      ${highlight("Learning paths", "Follow a structured route through a subject instead of choosing every next step yourself.")}
      ${paragraph("Your Sikhi University sign-in also works on <strong style=\"color:#0b1e3a;\">sikhi.io</strong> and <strong style=\"color:#0b1e3a;\">PunjabiUni</strong> &mdash; one account across all three.", 0)}
    `,
    footerNote: "If you didn&rsquo;t try to create a Sikhi University account, you can ignore this email &mdash; nothing has been created.",
  });

  const text = `SIKHI UNIVERSITY — Confirm your enrollment

${username ? `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh — and welcome, ${username}.` : "Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh."}

Your confirmation code: ${code}

Enter it in the browser tab where you started signing up, then choose a password. The code only works in that same tab — opening this email on another device won't sign anyone in. It expires in 15 minutes.

- A full departments catalogue: browse by department and take any course in any order.
- Free courses, real certificates: pass a course's assessment and a verifiable certificate is issued in your name.
- Learning paths: follow a structured route through a subject.

Your Sikhi University sign-in also works on sikhi.io and PunjabiUni — one account across all three.

If you didn't try to create a Sikhi University account, ignore this email — nothing has been created.

Respectfully,
Office of the Registrar
Sikhi University

Sikhi University · sikhiuni.com

Powered by sikhi.io — https://sikhi.io`;

  return { subject: `${code} is your Sikhi University confirmation code`, html, text };
}

// ── Magic-link sign-in — TEMPLATE DELETED 2026-09-06 ────────────────────────
// magicLinkTemplate lived here until the magic-link flow itself was retired
// (functions/api/auth/{request,verify}.js are now 410s — see request.js for
// why). It had zero call sites the moment that flow went, and a live-looking
// auth-email template with no caller is one bad merge away from being sent
// again. Recover it from git history if a link-based flow is ever genuinely
// wanted, but read request.js's header first: the objection was to the flow,
// not to the markup.

