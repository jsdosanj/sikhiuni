// Coalesce compatibility schema checks per warm Worker/database binding.
// Failure evicts the promise so a later request can retry. Migrations remain
// the deployment source of truth; this avoids DDL on every learning action.
const databases = new WeakMap();
export function schemaOnce(db, key, initialize) {
  let entries = databases.get(db);
  if (!entries) { entries = new Map(); databases.set(db, entries); }
  if (!entries.has(key)) {
    const pending = Promise.resolve().then(initialize).catch(error => { entries.delete(key); throw error; });
    entries.set(key, pending);
  }
  return entries.get(key);
}
