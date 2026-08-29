/**
 * Canonical JSON.
 *
 * The Screen Spec hash is the mechanism that keeps three branches honest
 * (ADR 0008), so two structurally identical specs must serialise byte-for-byte
 * identically regardless of key insertion order or float formatting. That is
 * what this does, and it is the only thing it does.
 */

function canonicalise(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('cannot canonicalise a non-finite number');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalise);
  }
  const entries = Object.entries(value as Record<string, unknown>)
    // undefined is absent, not null — dropping it keeps optional fields from
    // changing the hash depending on whether they were explicitly set.
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of entries) {
    result[key] = canonicalise(entryValue);
  }
  return result;
}

/** Deterministic JSON with sorted keys and no incidental whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}
