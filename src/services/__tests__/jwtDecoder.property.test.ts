// Feature: postman, Property 4: JWT Decoding Correctness

/**
 * Property-based tests for `src/services/jwtDecoder.ts`
 *
 * Property 4: JWT Decoding Correctness
 *   For any string that does not consist of exactly three dot-separated
 *   base64url-encoded segments where the second segment parses as valid JSON,
 *   decodeJwt() SHALL return { valid: false }.
 *
 *   For any well-formed JWT string whose payload JSON contains a numeric `exp`
 *   field, decodeJwt() SHALL return {
 *     valid: true,
 *     expiresAt: new Date(exp * 1000),
 *     isExpired: expiresAt < now,
 *     isExpiringSoon: expiresAt - now < 5 minutes
 *   }.
 *
 * Validates: Requirements 5.4, 5.6, 5.7
 *
 * Minimum iterations: 100
 */

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { decodeJwt } from '../jwtDecoder'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * base64url-encode a string (same algorithm as the production code).
 */
function base64urlEncode(input: string): string {
  return btoa(input)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/**
 * Build a syntactically valid JWT: header.payload.signature
 * The payload is JSON-serialised and base64url-encoded.
 */
function buildJwt(payload: Record<string, unknown>): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64urlEncode(JSON.stringify(payload))
  return `${header}.${body}.fakesignature`
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate strings that are definitively NOT valid 3-segment dot-separated
 * base64url+JSON JWTs. We use three complementary strategies:
 *
 *  A) fc.string() filtered to exclude any string that has exactly two dots
 *     and whose middle segment base64url-decodes to valid JSON.
 *     (This simple filter naturally covers the vast majority of arbitrary strings.)
 *
 *  B) Strings with zero, one, or 4+ dot-separated segments (wrong segment count).
 *
 *  C) Three-segment strings where the middle segment is NOT a valid base64url-
 *     encoded JSON object (e.g., plain text, JSON arrays, JSON primitives).
 *
 * We combine all three via fc.oneof for good coverage.
 */

/** Strategy A: arbitrary strings that, by chance or structure, are not valid JWTs */
const arbitraryInvalidStringArb = fc
  .string({ minLength: 0, maxLength: 120 })
  .filter((s) => {
    // Keep only strings that are definitively invalid
    const parts = s.split('.')
    if (parts.length !== 3) return true // wrong segment count → always invalid
    // Has 3 segments — check if middle decodes to a valid JSON object
    try {
      const base64 = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '=')
      const decoded = atob(base64)
      const parsed = JSON.parse(decoded)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        // Looks like a valid JWT payload — exclude from invalid set
        return false
      }
    } catch {
      // Decode or parse failed → not a valid JWT
    }
    return true
  })

/** Strategy B: strings with the wrong number of segments (not exactly 3) */
const wrongSegmentCountArb = fc.oneof(
  // 0 dots (1 segment)
  fc.stringMatching(/^[^.]{0,40}$/),
  // 1 dot (2 segments)
  fc.tuple(fc.string({ maxLength: 20 }), fc.string({ maxLength: 20 })).map(
    ([a, b]) => `${a}.${b}`,
  ),
  // 3 dots (4 segments)
  fc
    .tuple(
      fc.string({ maxLength: 10 }),
      fc.string({ maxLength: 10 }),
      fc.string({ maxLength: 10 }),
      fc.string({ maxLength: 10 }),
    )
    .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
)

/** Strategy C: three-segment strings where middle is not a valid JSON object */
const invalidMiddleSegmentArb = fc.oneof(
  // Middle segment is not valid base64 at all (contains characters outside base64url alphabet)
  fc
    .tuple(
      fc.string({ maxLength: 10 }),
      fc.string({ maxLength: 10 }),
    )
    .map(([a, c]) => `${a}.!!!invalid_base64!!!.${c}`),
  // Middle segment is base64url but decodes to a JSON array
  fc
    .tuple(fc.string({ maxLength: 10 }), fc.string({ maxLength: 10 }))
    .map(([a, c]) => `${a}.${base64urlEncode(JSON.stringify([1, 2, 3]))}.${c}`),
  // Middle segment is base64url but decodes to a JSON number
  fc
    .tuple(fc.string({ maxLength: 10 }), fc.string({ maxLength: 10 }))
    .map(([a, c]) => `${a}.${base64urlEncode(JSON.stringify(42))}.${c}`),
  // Middle segment is base64url but decodes to a JSON string (not object)
  fc
    .tuple(fc.string({ maxLength: 10 }), fc.string({ maxLength: 10 }))
    .map(([a, c]) => `${a}.${base64urlEncode(JSON.stringify('just a string'))}.${c}`),
  // Middle segment is base64url but decodes to non-JSON text
  fc
    .tuple(fc.string({ maxLength: 10 }), fc.string({ maxLength: 10 }))
    .map(([a, c]) => `${a}.${base64urlEncode('not valid json at all')}.${c}`),
)

/** Combined invalid input arbitrary */
const invalidJwtArb = fc.oneof(
  arbitraryInvalidStringArb,
  wrongSegmentCountArb,
  invalidMiddleSegmentArb,
)

/**
 * Generate well-formed JWTs with an arbitrary integer `exp` claim.
 *
 * We use fc.integer() for exp, which covers a wide range including
 * past timestamps (expired), near-future (expiring soon), and far-future.
 *
 * We record the `before` and `after` timestamps around the decodeJwt() call
 * inside each test assertion, so we can verify the computed flags accurately.
 */
const validJwtWithExpArb = fc.integer({ min: -2_000_000_000, max: 4_000_000_000 }).map((exp) => ({
  exp,
  token: buildJwt({ sub: 'test-user', iat: 1000000, exp }),
}))

// ---------------------------------------------------------------------------
// Property 4a: Invalid inputs → valid: false
// ---------------------------------------------------------------------------

describe('Property 4 — JWT Decoding Correctness: invalid inputs return valid: false', () => {
  it(
    'returns { valid: false } for any string that is not a valid 3-segment base64url-JSON JWT',
    () => {
      fc.assert(
        fc.property(invalidJwtArb, (token) => {
          const result = decodeJwt(token)

          expect(result.valid).toBe(false)
          expect(result.isExpired).toBe(false)
          expect(result.isExpiringSoon).toBe(false)
          expect(result.expiresAt).toBeUndefined()
        }),
        { numRuns: 100 },
      )
    },
  )
})

// ---------------------------------------------------------------------------
// Property 4b: Valid JWTs with numeric exp → correct computed fields
// ---------------------------------------------------------------------------

describe('Property 4 — JWT Decoding Correctness: well-formed JWTs with exp return correct fields', () => {
  it(
    'returns valid: true with correct expiresAt, isExpired, and isExpiringSoon for any integer exp',
    () => {
      fc.assert(
        fc.property(validJwtWithExpArb, ({ exp, token }) => {
          const fiveMinutesMs = 5 * 60 * 1000
          const expectedExpiresAt = new Date(exp * 1000)

          // Bracket the call to get tight bounds on "now"
          const beforeMs = Date.now()
          const result = decodeJwt(token)
          const afterMs = Date.now()

          // valid must be true
          expect(result.valid).toBe(true)

          // expiresAt must be exactly new Date(exp * 1000)
          expect(result.expiresAt).toBeInstanceOf(Date)
          expect(result.expiresAt!.getTime()).toBe(expectedExpiresAt.getTime())

          // isExpired: expiresAt < now
          // Using the bracketed time range: if expiresAt <= beforeMs it must be expired,
          // if expiresAt > afterMs it must not be expired.
          const expiresAtMs = result.expiresAt!.getTime()
          if (expiresAtMs <= beforeMs) {
            expect(result.isExpired).toBe(true)
          } else if (expiresAtMs > afterMs) {
            expect(result.isExpired).toBe(false)
          }
          // (In the tiny window beforeMs < expiresAt <= afterMs we cannot deterministically
          //  assert, so we skip — this is standard practice for time-dependent properties)

          // isExpiringSoon: token is not expired AND expiresAt - now < 5 minutes
          // If expired, isExpiringSoon must be false
          if (result.isExpired) {
            expect(result.isExpiringSoon).toBe(false)
          }

          // If expiresAt is well beyond 5 minutes from now (conservative: > afterMs + 5min + 1s buffer)
          if (expiresAtMs > afterMs + fiveMinutesMs + 1000) {
            expect(result.isExpiringSoon).toBe(false)
          }

          // If expiresAt is in the range (now, now + 5min), isExpiringSoon must be true.
          // We use beforeMs as "now" lower bound and afterMs as "now" upper bound.
          // Safe assertion: if expiresAt > afterMs AND expiresAt < beforeMs + 5min
          // then no matter when in [beforeMs, afterMs] the clock was, the token is expiring soon.
          if (expiresAtMs > afterMs && expiresAtMs < beforeMs + fiveMinutesMs) {
            expect(result.isExpiringSoon).toBe(true)
          }
        }),
        { numRuns: 100 },
      )
    },
  )

  it(
    'expiresAt is exactly new Date(exp * 1000) for any integer exp',
    () => {
      fc.assert(
        fc.property(validJwtWithExpArb, ({ exp, token }) => {
          const result = decodeJwt(token)

          expect(result.valid).toBe(true)
          expect(result.expiresAt).toBeInstanceOf(Date)
          expect(result.expiresAt!.getTime()).toBe(exp * 1000)
        }),
        { numRuns: 100 },
      )
    },
  )

  it(
    'isExpired is true iff expiresAt is in the past (exp in the past)',
    () => {
      // Use only past exp values to make the assertion deterministic
      fc.assert(
        fc.property(
          fc.integer({ min: -2_000_000_000, max: 0 }).map((exp) => ({
            exp: Math.floor(Date.now() / 1000) + exp - 1, // always in the past
            token: buildJwt({ exp: Math.floor(Date.now() / 1000) + exp - 1 }),
          })),
          ({ exp, token }) => {
            const result = decodeJwt(token)

            expect(result.valid).toBe(true)
            expect(result.isExpired).toBe(true)
            expect(result.isExpiringSoon).toBe(false)
            expect(result.expiresAt!.getTime()).toBe(exp * 1000)
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  it(
    'isExpiringSoon is true and isExpired is false when exp is within 5 minutes in the future',
    () => {
      // Use exp values that are 1–299 seconds in the future (strictly within 5 minutes)
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 299 }).map((secondsAhead) => {
            const exp = Math.floor(Date.now() / 1000) + secondsAhead
            return { exp, token: buildJwt({ exp }) }
          }),
          ({ exp, token }) => {
            const result = decodeJwt(token)

            expect(result.valid).toBe(true)
            expect(result.isExpired).toBe(false)
            expect(result.isExpiringSoon).toBe(true)
            expect(result.expiresAt!.getTime()).toBe(exp * 1000)
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  it(
    'isExpiringSoon is false and isExpired is false when exp is beyond 5 minutes in the future',
    () => {
      // Use exp values that are at least 301 seconds in the future
      fc.assert(
        fc.property(
          fc.integer({ min: 301, max: 1_000_000 }).map((secondsAhead) => {
            const exp = Math.floor(Date.now() / 1000) + secondsAhead
            return { exp, token: buildJwt({ exp }) }
          }),
          ({ exp, token }) => {
            const result = decodeJwt(token)

            expect(result.valid).toBe(true)
            expect(result.isExpired).toBe(false)
            expect(result.isExpiringSoon).toBe(false)
            expect(result.expiresAt!.getTime()).toBe(exp * 1000)
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})
