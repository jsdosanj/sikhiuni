// Sikhi Studio publish protocol, v1 — signature verification.
// (_-prefixed → not a route.) Spec: sikhi.io's docs/studio/publish-protocol.md.
//
// Pure Web Crypto, no D1, no env beyond the secret string itself — so this can
// be unit-tested against the protocol's own test vector without a database.
//
// Canonical string (six lines, joined with "\n", no trailing newline):
//   sikhi-studio-publish/v1
//   <X-Studio-Timestamp>
//   <HTTP method, upper case>
//   <URL pathname>
//   <X-Studio-Publication>
//   <lowercase hex SHA-256 of the raw request body bytes>
//
// The secret is used as its own raw UTF-8 bytes (not hex-decoded) — confirmed
// against the spec's test vector, which is NOT a hex string.

const PROTOCOL_PREFIX = "sikhi-studio-publish/v1";
const MAX_SKEW_SEC = 300;
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const SIG_RE = /^v1=([0-9a-f]{64})$/i;

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function hmacKey(secret, usages) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

/** Builds the six-line canonical string the signature is computed over. */
export function canonicalString({ timestamp, method, pathname, publicationId, bodySha256Hex }) {
  return [
    PROTOCOL_PREFIX,
    String(timestamp),
    String(method).toUpperCase(),
    pathname,
    publicationId,
    bodySha256Hex,
  ].join("\n");
}

/** Signs a canonical string. Returns "v1=<lowercase hex>". Test/sender-side only — a receiver only ever verifies. */
export async function sign(secret, canonical) {
  const key = await hmacKey(secret, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical));
  return "v1=" + bytesToHex(new Uint8Array(mac));
}

/**
 * Verifies a signed Sikhi Studio publish request against the protocol's five
 * MUST rules, in order, and returns either `{ ok: true, body }` (the parsed
 * JSON body) or `{ ok: false, status, code }`.
 *
 * `rawBytes` MUST be the exact bytes of the request body — never a
 * re-serialized JSON.parse/JSON.stringify round trip, which can silently
 * normalize away a tampered byte (key order, whitespace) that the signature
 * was computed over.
 */
export async function verifyStudioRequest(request, rawBytes, secret, nowSec) {
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);

  // 1. secret missing/short -> never accept an unsigned request.
  if (!secret || secret.length < 32) return { ok: false, status: 503, code: "not_configured" };

  // 2. body size cap.
  if (rawBytes.byteLength > MAX_BODY_BYTES) return { ok: false, status: 413, code: "body_too_large" };

  const publicationId = request.headers.get("X-Studio-Publication") || "";
  const timestampHeader = request.headers.get("X-Studio-Timestamp") || "";
  const signatureHeader = request.headers.get("X-Studio-Signature") || "";
  const timestamp = Number(timestampHeader);
  const sigMatch = SIG_RE.exec(signatureHeader);

  // Missing/malformed headers can never verify — same bucket as a bad signature.
  if (!publicationId || !timestampHeader || !Number.isFinite(timestamp) || !sigMatch) {
    return { ok: false, status: 401, code: "bad_signature" };
  }

  // 3. clock skew.
  if (Math.abs(now - timestamp) > MAX_SKEW_SEC) return { ok: false, status: 401, code: "stale_timestamp" };

  // 4. recompute over the RAW bytes, compare in constant time (subtle.verify).
  const bodySha256Hex = await sha256Hex(rawBytes);
  const pathname = new URL(request.url).pathname;
  const canonical = canonicalString({ timestamp: timestampHeader, method: request.method, pathname, publicationId, bodySha256Hex });
  const key = await hmacKey(secret, ["verify"]);
  const sigOk = await crypto.subtle.verify("HMAC", key, hexToBytes(sigMatch[1]), new TextEncoder().encode(canonical));
  if (!sigOk) return { ok: false, status: 401, code: "bad_signature" };

  // 5. parse + cross-check the body against the headers.
  let body;
  try { body = JSON.parse(new TextDecoder().decode(rawBytes)); }
  catch (e) { return { ok: false, status: 400, code: "invalid_body" }; }
  if (!body || typeof body !== "object" || body.protocol !== 1 || body.publicationId !== publicationId) {
    return { ok: false, status: 400, code: "invalid_body" };
  }

  return { ok: true, body };
}
