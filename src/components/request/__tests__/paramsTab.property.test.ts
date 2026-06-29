// Feature: postman, Property 6: Query String ↔ Params Round-Trip

/**
 * Property-based tests for the query string serialisation/parsing logic
 * extracted from `src/components/request/ParamsTab.vue`.
 *
 * Property 6: Query String ↔ Params Round-Trip
 *   For any array of URL-safe KeyValue pairs (enabled = true), serialising to a
 *   query string via URLSearchParams and then parsing back must produce an
 *   equivalent key-value set (same keys and values, order may differ).
 *
 * Validates: Requirements 2.5, 2.6
 *
 * Minimum iterations: 100
 */

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { KeyValue } from '@/types'

// ---------------------------------------------------------------------------
// Serialise / parse logic — inlined from ParamsTab.vue
// ---------------------------------------------------------------------------

/**
 * Parse the query string portion of `url` into `KeyValue[]`.
 * Mirrors the `parseQueryParams` function in ParamsTab.vue.
 */
function parseQueryParams(url: string): KeyValue[] {
  try {
    const fullUrl =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `http://placeholder${url.startsWith('/') ? '' : '/'}${url}`
    const parsed = new URL(fullUrl)
    const result: KeyValue[] = []
    parsed.searchParams.forEach((value, key) => {
      result.push({ key, value, enabled: true })
    })
    return result
  } catch {
    const qIndex = url.indexOf('?')
    if (qIndex === -1) return []
    const qs = url.slice(qIndex + 1)
    if (!qs) return []
    return qs
      .split('&')
      .map((pair) => {
        const eqIndex = pair.indexOf('=')
        if (eqIndex === -1) {
          return { key: decodeURIComponent(pair), value: '', enabled: true }
        }
        return {
          key: decodeURIComponent(pair.slice(0, eqIndex)),
          value: decodeURIComponent(pair.slice(eqIndex + 1)),
          enabled: true,
        }
      })
      .filter((r) => r.key !== '')
  }
}

/**
 * Serialise an array of enabled KeyValue pairs to a query string.
 * Mirrors the `buildUrl` function in ParamsTab.vue, but returns only
 * the query string portion (after "?") to simplify testing.
 */
function serializeToQueryString(kvRows: KeyValue[]): string {
  const enabled = kvRows.filter((r) => r.enabled && r.key !== '')
  if (enabled.length === 0) return ''
  const params = new URLSearchParams()
  for (const row of enabled) {
    params.append(row.key, row.value)
  }
  return `?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * URL-safe string: only characters that URLSearchParams encodes and decodes
 * losslessly without ambiguity. We restrict to alphanumeric characters plus a
 * small safe set ("-", "_", ".", "~") to avoid percent-encoding edge cases
 * that could cause key collisions or value mismatches after round-trip.
 * Keys must be non-empty; values may be empty.
 */
const urlSafeStringArb = (minLen: number) =>
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~'.split('')),
    { minLength: minLen, maxLength: 30 },
  )

const urlSafeKeyArb = urlSafeStringArb(1)
const urlSafeValueArb = fc.oneof(
  fc.constant(''),
  urlSafeStringArb(1),
)

/**
 * Generate a single URL-safe KeyValue with enabled = true.
 */
const enabledKvArb = fc.record({
  key: urlSafeKeyArb,
  value: urlSafeValueArb,
  enabled: fc.constant(true as const),
})

/**
 * Generate an array of 1–10 URL-safe KeyValue pairs.
 * We allow duplicate keys (URLSearchParams supports multi-values) but keep the
 * array non-empty so the round-trip is always exercised.
 */
const kvArrayArb = fc.array(enabledKvArb, { minLength: 1, maxLength: 10 })

// ---------------------------------------------------------------------------
// Helper: normalise to a comparable representation
// ---------------------------------------------------------------------------

/**
 * Converts a KeyValue array to a sorted array of `key=value` strings so that
 * order-independent equality can be asserted.
 * When the same key appears multiple times, URLSearchParams preserves all
 * occurrences, so we keep duplicates and sort globally.
 */
function toSortedPairs(rows: KeyValue[]): string[] {
  return rows
    .filter((r) => r.enabled && r.key !== '')
    .map((r) => `${r.key}=${r.value}`)
    .sort()
}

// ---------------------------------------------------------------------------
// Property 6: Query String ↔ Params Round-Trip
// ---------------------------------------------------------------------------

describe('Property 6 — Query String ↔ Params Round-Trip', () => {
  /**
   * Core property: serialising an array of enabled KeyValue pairs to a query
   * string and parsing it back produces an equivalent set of key-value pairs.
   *
   * Validates: Requirements 2.5, 2.6
   */
  it(
    'parsing a serialised query string recovers the original key-value set',
    () => {
      fc.assert(
        fc.property(kvArrayArb, (original) => {
          const queryString = serializeToQueryString(original)
          const parsed = parseQueryParams(queryString)

          const originalPairs = toSortedPairs(original)
          const parsedPairs = toSortedPairs(parsed)

          expect(parsedPairs).toEqual(originalPairs)
        }),
        { numRuns: 100 },
      )
    },
  )

  /**
   * Idempotency: serialising twice from the same key-value set yields the same
   * query string both times (the serialisation is deterministic).
   *
   * Validates: Requirements 2.5
   */
  it(
    'serialisation is deterministic: encoding the same rows twice yields the same query string',
    () => {
      fc.assert(
        fc.property(kvArrayArb, (original) => {
          const first = serializeToQueryString(original)
          const second = serializeToQueryString(original)

          expect(second).toBe(first)
        }),
        { numRuns: 100 },
      )
    },
  )

  /**
   * Re-serialisation round-trip: parse → serialise → parse must produce the
   * same result as the first parse (the representation stabilises after one
   * round-trip).
   *
   * Validates: Requirements 2.6
   */
  it(
    'parsed rows can be re-serialised and re-parsed to the same result (stable after one round-trip)',
    () => {
      fc.assert(
        fc.property(kvArrayArb, (original) => {
          const queryString = serializeToQueryString(original)
          const parsed = parseQueryParams(queryString)

          // Second round-trip
          const reSerialised = serializeToQueryString(parsed)
          const reParsed = parseQueryParams(reSerialised)

          expect(toSortedPairs(reParsed)).toEqual(toSortedPairs(parsed))
        }),
        { numRuns: 100 },
      )
    },
  )

  /**
   * Key preservation: every key present in the original enabled rows must
   * appear in the parsed result (no keys are silently dropped).
   *
   * Validates: Requirements 2.5, 2.6
   */
  it(
    'every original key is present in the parsed result',
    () => {
      fc.assert(
        fc.property(kvArrayArb, (original) => {
          const queryString = serializeToQueryString(original)
          const parsed = parseQueryParams(queryString)

          const parsedKeys = parsed.map((r) => r.key)

          for (const { key } of original.filter((r) => r.enabled && r.key !== '')) {
            expect(
              parsedKeys.includes(key),
              `Key "${key}" from original was not found in parsed result`,
            ).toBe(true)
          }
        }),
        { numRuns: 100 },
      )
    },
  )

  /**
   * No extra keys introduced: the parsed result must not contain keys that
   * were absent from the original serialised input.
   *
   * Validates: Requirements 2.6
   */
  it(
    'parsed result contains no extra keys beyond those in the original',
    () => {
      fc.assert(
        fc.property(kvArrayArb, (original) => {
          const queryString = serializeToQueryString(original)
          const parsed = parseQueryParams(queryString)

          const originalKeySet = new Set(
            original.filter((r) => r.enabled && r.key !== '').map((r) => r.key),
          )

          for (const { key } of parsed) {
            expect(
              originalKeySet.has(key),
              `Unexpected key "${key}" appeared in parsed result`,
            ).toBe(true)
          }
        }),
        { numRuns: 100 },
      )
    },
  )
})
