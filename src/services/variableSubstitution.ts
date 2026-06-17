import type { KeyValue } from '../types'

/**
 * Replace every {{key}} token in `template` with the matching value
 * from `variables`. Only variables with `enabled === true` are considered.
 * Tokens with no match (or whose matching entry is disabled) are left unchanged.
 *
 * @returns An object with:
 *   - `result`: the substituted string
 *   - `unresolved`: a Set of token names that had no enabled match
 */
export function interpolate(
  template: string,
  variables: KeyValue[]
): { result: string; unresolved: Set<string> } {
  // Build a lookup map from enabled variables only
  const lookup = new Map<string, string>()
  for (const kv of variables) {
    if (kv.enabled) {
      lookup.set(kv.key, kv.value)
    }
  }

  const unresolved = new Set<string>()
  const regex = /\{\{([^}]+)\}\}/g

  const result = template.replace(regex, (_match, token: string) => {
    if (lookup.has(token)) {
      return lookup.get(token)!
    }
    unresolved.add(token)
    return _match // leave unresolved tokens unchanged
  })

  return { result, unresolved }
}
