/** Preserve only an on-site destination through the nested hub/consumer redirects. */
export function safeLoginReturn(value: string | null, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u0020]/.test(decoded)) return fallback;
    const url = new URL(value, "https://return.invalid");
    return url.origin === "https://return.invalid" ? value : fallback;
  } catch { return fallback; }
}

export function universitySigninHref(origin: string, destination: string, google = false): string {
  const consumer = new URL("/api/auth/sso", origin);
  consumer.searchParams.set("return", safeLoginReturn(destination));
  const issue = `/api/sso/issue?return=${encodeURIComponent(consumer.href)}`;
  if (!google) return `https://sikhi.io${issue}`;
  const signin = new URL("/signin", "https://sikhi.io");
  signin.searchParams.set("provider", "google");
  signin.searchParams.set("next", issue);
  return signin.href;
}
