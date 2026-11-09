// Payload-less Web Push sender with VAPID (RFC 8292), zero dependencies.
//
// A payload-less push wakes the service worker, which shows the reminder text
// itself (sw.js `push` handler) — so no RFC 8291 payload encryption is needed.
// VAPID = an ES256-signed JWT in the Authorization header, keyed by the
// VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY secrets (docs/DEPLOY.md explains how to
// generate them). If the secrets are absent the sender is a no-op.

import { isAllowedPushEndpoint } from "./push-hosts.js";

const te = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Import the raw VAPID keypair (public: 65-byte uncompressed point, private:
// 32-byte scalar, both base64url — the format `npx web-push generate-vapid-keys`
// emits) as a WebCrypto ECDSA P-256 signing key via JWK.
async function importVapidKey(publicKeyB64, privateKeyB64) {
  const pub = b64urlToBytes(publicKeyB64);
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC", crv: "P-256",
      x: b64url(pub.slice(1, 33)),
      y: b64url(pub.slice(33, 65)),
      d: privateKeyB64,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function vapidJwt(env, audience) {
  const header = b64url(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(te.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "https://sikhiuni.com/feedback",
  })));
  const key = await importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(header + "." + payload));
  return header + "." + payload + "." + b64url(sig);
}

export function pushConfigured(env) {
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

// Send one payload-less push. Returns the HTTP status; 404/410 mean the
// subscription is dead and should be deleted.
export async function sendPush(env, endpoint) {
  // Defence in depth: never request a host outside the push-service allowlist. Returns 0 (neither sent nor
  // dead) so a legitimate vendor host missing from the list is skipped, not deleted; the row just stays unused.
  if (!isAllowedPushEndpoint(endpoint)) { console.warn("push: endpoint host not on the allowlist, skipped"); return 0; }
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJwt(env, aud);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      Urgency: "normal",
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
  });
  return res.status;
}

// Daily reminder sweep, called from the Worker's scheduled() handler. Sends to
// every stored subscription and prunes the dead ones. Caps per run so a huge
// table can never blow the cron CPU budget.
export async function sendDailyReminders(env) {
  if (!pushConfigured(env) || !env.DB) return { sent: 0, pruned: 0, skipped: true };
  let rows;
  try {
    rows = (await env.DB.prepare("SELECT endpoint FROM push_subs LIMIT 5000").all()).results || [];
  } catch (e) { return { sent: 0, pruned: 0, skipped: true }; } // table absent
  let sent = 0, pruned = 0;
  for (const { endpoint } of rows) {
    try {
      const status = await sendPush(env, endpoint);
      if (status === 404 || status === 410) {
        await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?1").bind(endpoint).run();
        pruned++;
      } else if (status >= 200 && status < 300) {
        sent++;
      }
    } catch (e) { /* one bad endpoint never stops the sweep */ }
  }
  return { sent, pruned, skipped: false };
}
