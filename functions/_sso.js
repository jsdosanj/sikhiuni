// Cross-domain SSO consumer -- the sikhiuni.com side of the handoff minted
// by sikhi.io's lib/auth/sso.ts (built same session, 2026-09-03). Same
// HMAC-SHA256 token shape as punjabiuni's lib/auth/sso.ts -- duplicated,
// not imported, across all three repos (no shared package between them).
//
// EMAIL IS THE JOIN KEY, not any site's internal user id -- see the long
// comment in sikhi.io's lib/auth/sso.ts for why. sikhiuni's own `users.id`
// is a crypto.randomUUID()-derived string (see functions/api/_lib.js
// newId()), completely independent of sikhi.io's Clerk/Better-Auth ids and
// punjabiuni's randomId() -- none of these three id spaces line up.

function b64urlDecode(s) {
  // Accept only the issuer's unpadded base64url representation. atob also
  // accepts padding, whitespace, standard-base64 characters and nonzero
  // unused bits, which would alias the same signature under another replay hash.
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("Invalid base64url");
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  if (btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== s) {
    throw new Error("Noncanonical base64url");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secretHex) {
  const keyBytes = new Uint8Array(secretHex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
}

/** Verifies signature AND expiry. Returns the payload, or null on any failure -- never throws. */
export async function verifySsoToken(token, secretHex) {
  try {
    const parts = token.split(".");
    // Reject suffixes: a different token string must not reuse a signed body
    // while bypassing a consumer's whole-token replay hash.
    if (parts.length !== 2) return null;
    const [bodyB64, sigB64] = parts;
    if (!bodyB64 || !sigB64) return null;
    const key = await hmacKey(secretHex);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sigB64), new TextEncoder().encode(bodyB64));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(bodyB64)));
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;
    return payload;
  } catch {
    return null;
  }
}

const SSO_DEFAULT_RETURN = "/dashboard.html";

/** Local navigation only; decode nested path escapes before accepting a return. */
export function safeSsoReturnPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return SSO_DEFAULT_RETURN;
  let path = value.split(/[?#]/, 1)[0];
  try {
    for (let i = 0; i < 5; i++) {
      if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path)) return SSO_DEFAULT_RETURN;
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
      if (i === 4) return SSO_DEFAULT_RETURN;
    }
    // Encoded controls/backslashes are unsafe in query/fragment too.
    let decoded = value;
    for (let i = 0; i < 5; i++) {
      const next = decodeURIComponent(decoded);
      if (/[\\\u0000-\u001f\u007f]/.test(next)) return SSO_DEFAULT_RETURN;
      if (next === decoded) break;
      decoded = next;
      if (i === 4) return SSO_DEFAULT_RETURN;
    }
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.pathname.startsWith("//")) return SSO_DEFAULT_RETURN;
    return url.pathname + url.search + url.hash;
  } catch {
    return SSO_DEFAULT_RETURN;
  }
}
