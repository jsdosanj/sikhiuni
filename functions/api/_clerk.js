// One login for Sikhi.io, Sikhi University and PunjabiUni.
//
// Sikhi.io signs people in with Clerk (clerk.sikhi.io). The native app, and any other client, can send that
// session token here as `Authorization: Bearer <jwt>`. We verify it against Clerk's PUBLIC keys (no secret
// needed), take the verified email, and map it to this site's own account, exactly as the magic-link flow
// does. Cookie sessions keep working unchanged; this is an additional way in, never a replacement.
//
// Safety rules (see getUserFromClerk in _lib.js):
//   - bearer-authenticated users are always plain learners: never admin/teacher, never MFA-cleared;
//   - unknown/invalid/expired tokens are anonymous, never an error that reveals anything.

export const CLERK_ISSUER = "https://clerk.sikhi.io";
const JWKS_TTL_MS = 60 * 60 * 1000;
let jwksCache = { at: 0, keys: null };

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function decodeJson(part) {
  try { return JSON.parse(new TextDecoder().decode(b64urlToBytes(part))); } catch (e) { return null; }
}

export function bearerToken(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  return m ? m[1] : null;
}

async function loadKeys(env, fresh) {
  if (!fresh && jwksCache.keys && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const url = (env && env.CLERK_JWKS_URL) || `${CLERK_ISSUER}/.well-known/jwks.json`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("jwks " + r.status);
  const body = await r.json();
  jwksCache = { at: Date.now(), keys: Array.isArray(body.keys) ? body.keys : [] };
  return jwksCache.keys;
}

export function resetClerkCache() { jwksCache = { at: 0, keys: null }; }

// Returns the verified payload, or null. Never throws.
export async function verifyClerkToken(token, env = {}, now = Date.now()) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJson(parts[0]), payload = decodeJson(parts[1]);
    if (!header || !payload || header.alg !== "RS256" || !header.kid) return null;
    let keys = await loadKeys(env, false);
    let jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) { keys = await loadKeys(env, true); jwk = keys.find((k) => k.kid === header.kid); }   // key rotation
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    if (!ok) return null;
    const issuer = (env && env.CLERK_ISSUER) || CLERK_ISSUER;
    const sec = Math.floor(now / 1000);
    if (payload.iss !== issuer || typeof payload.sub !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp + 5 < sec) return null;
    if (typeof payload.nbf === "number" && payload.nbf - 5 > sec) return null;
    return payload;
  } catch (e) { return null; }
}

// The verified email for a token: the `email` claim if the Clerk session token is customised to include it
// (Dashboard → Sessions → Customize session token), otherwise the Clerk Backend API when CLERK_SECRET_KEY is set.
export async function emailFor(payload, env = {}) {
  if (typeof payload.email === "string" && payload.email.includes("@") && payload.email_verified !== false) return payload.email.trim().toLowerCase();
  if (!env.CLERK_SECRET_KEY) return null;
  try {
    const r = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(payload.sub)}`, { headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` } });
    if (!r.ok) return null;
    const u = await r.json();
    const primary = (u.email_addresses || []).find((e) => e.id === u.primary_email_address_id) || (u.email_addresses || [])[0];
    if (!primary || (primary.verification && primary.verification.status && primary.verification.status !== "verified")) return null;
    return String(primary.email_address || "").trim().toLowerCase() || null;
  } catch (e) { return null; }
}
