const DEFAULT_RETURN = "/dashboard";

/** Local navigation only; decode nested path escapes before accepting a return. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return DEFAULT_RETURN;
  let path = value.split(/[?#]/, 1)[0];
  try {
    for (let i = 0; i < 5; i++) {
      if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path)) return DEFAULT_RETURN;
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
      if (i === 4) return DEFAULT_RETURN;
    }
    // Encoded controls/backslashes are unsafe in query/fragment too.
    let decoded = value;
    for (let i = 0; i < 5; i++) {
      const next = decodeURIComponent(decoded);
      if (/[\\\u0000-\u001f\u007f]/.test(next)) return DEFAULT_RETURN;
      if (next === decoded) break;
      decoded = next;
      if (i === 4) return DEFAULT_RETURN;
    }
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.pathname.startsWith("//")) return DEFAULT_RETURN;
    return url.pathname + url.search + url.hash;
  } catch {
    return DEFAULT_RETURN;
  }
}
