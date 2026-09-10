// Server-only family credential lookup. Never stores or returns a password/hash.
// Bindings are fixed in Wrangler, never supplied by the client. Source reads only.
const SITES = [
  ['sikhi.io', 'FAMILY_SIKHI_DB', 'user', 'handle'],
  ['sikhiuni.com', 'FAMILY_SIKHIUNI_DB', 'users', 'username'],
  ['punjabiuni.com', 'FAMILY_PUNJABI_DB', 'user', 'handle'],
];
const DUMMY = `pbkdf2$100000$${'0'.repeat(32)}$${'0'.repeat(64)}`;
export async function verifyFamilyCredentials(env, localSite, identifierRaw, password, verifyPassword, localEmail = null) {
  const identifier = identifierRaw.trim().toLowerCase();
  if (!SITES.some(([site,binding]) => site !== localSite && env?.[binding])) return {ok:false,error:'invalid_credentials'};
  if (!identifier || identifier.length > 254 || !password || password.length > 1024) return { ok: false, error: 'invalid_credentials' };
  const matches = []; let unavailable = false;
  for (const [site, binding, table, handle] of SITES) {
    if (site === localSite) continue;
    const db = env[binding];
    if (!db) { unavailable = true; continue; }
    try {
      const column = identifier.includes('@') ? 'email' : handle;
      const sql = table === 'users'
        ? `SELECT id,email,name,email_verified,password_hash AS password FROM users WHERE ${column} = ?`
        : `SELECT u.id,u.email,u.name,u.email_verified,a.password FROM user u LEFT JOIN account a ON a.user_id=u.id AND a.provider_id='credentials' WHERE u.${column} = ?`;
      const row = await db.prepare(sql).bind(identifier).first();
      const valid = await verifyPassword(password, row?.password || DUMMY);
      if (!valid || !row?.password) continue;
      // A local username must never silently switch to another person's email.
      if (localEmail && row.email.toLowerCase() !== localEmail.toLowerCase()) continue;
      if (!row.email_verified) { matches.push({ error: 'verify_email', site }); continue; }
      if (table === 'users') {
        const mfa = await db.prepare('SELECT enabled_at FROM user_mfa WHERE user_id=?').bind(row.id).first();
        if (mfa?.enabled_at) { matches.push({ error: 'source_mfa_required', site }); continue; }
      }
      matches.push({ email: row.email.toLowerCase(), name: row.name || null, site });
    } catch { unavailable = true; }
  }
  const identities = matches.filter(m => m.email);
  if (new Set(identities.map(m => m.email)).size > 1) return { ok: false, error: 'ambiguous_identifier' };
  // An unavailable source may own the same username. Email/local identity is unambiguous.
  if (identities.length && unavailable && !identifier.includes('@') && !localEmail) return { ok: false, error: 'family_unavailable' };
  if (identities.length) return { ok: true, identity: identities[0] };
  if (matches.length) return { ok: false, error: matches[0].error, site: matches[0].site };
  return { ok: false, error: unavailable ? 'family_unavailable' : 'invalid_credentials' };
}
export function familyErrorMessage(result) {
  if (result.error === 'verify_email') return `Verify your email on ${result.site} before using that account here.`;
  if (result.error === 'source_mfa_required') return `This account requires two-factor sign-in on ${result.site}. Use its sign-in page to complete verification.`;
  if (result.error === 'ambiguous_identifier') return 'That username matches different accounts. Please sign in with your email address.';
  if (result.error === 'family_unavailable') return 'Shared sign-in is temporarily unavailable. Try Continue with sikhi.io, or try again shortly.';
  return 'Incorrect username/email or password.';
}
