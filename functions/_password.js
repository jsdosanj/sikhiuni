// Password hashing for sikhiuni.com. Same PBKDF2-SHA256, 100,000-iteration
// scheme as the sibling sikhi.io/punjabiuni repos (lib/auth/crypto.ts) --
// duplicated, not shared, across all three (no shared package). The
// iteration count is capped at 100k on purpose, NOT the OWASP-2023
// recommended 210k: Cloudflare Workers' PBKDF2 hard-throws
// NotSupportedError above 100k -- confirmed live on sikhi.io's identical
// build the same session (its first production signup 500'd on exactly
// this before the fix).
const PBKDF2_ITERATIONS = 100_000;

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
}
function isHex(s) {
  return typeof s === "string" && /^[0-9a-f]+$/i.test(s) && s.length % 2 === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const parts = (stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations <= 0 || iterations > 1_000_000) return false;
  const saltHex = parts[2];
  const expectedHex = parts[3];
  if (!isHex(saltHex) || !isHex(expectedHex)) return false;
  if (saltHex.length !== 32 || expectedHex.length !== 64) return false;
  let gotHex = "";
  try {
    const salt = fromHex(saltHex);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
    gotHex = toHex(new Uint8Array(bits));
  } catch {
    return false;
  }
  if (gotHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < gotHex.length; i++) diff |= gotHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

export const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$${"0".repeat(32)}$${"0".repeat(64)}`;
