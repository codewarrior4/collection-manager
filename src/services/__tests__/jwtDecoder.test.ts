/**
 * Unit tests for `src/services/jwtDecoder.ts`
 *
 * Covers:
 *  - Valid JWT with a future `exp` claim
 *  - Expired JWT (`exp` in the past)
 *  - JWT expiring in < 5 minutes
 *  - Missing `exp` claim (valid structure, no expiry)
 *  - Malformed segments (wrong number of dots)
 *  - Empty string input
 *  - Non-base64 / non-JSON payload (three segments, undecodable middle)
 *
 * Requirements: 5.4, 5.6, 5.7
 */

import { describe, expect, it } from 'vitest'
import { decodeJwt } from '../jwtDecoder'

// ---------------------------------------------------------------------------
// Helper — build a syntactically valid JWT with an arbitrary payload
// ---------------------------------------------------------------------------

function makeJwt(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${header}.${body}.fakesignature`
}

// Current Unix timestamp helpers
const nowSec = () => Math.floor(Date.now() / 1000)

// ---------------------------------------------------------------------------
// Valid JWT — future `exp`
// ---------------------------------------------------------------------------

describe('decodeJwt — valid JWT with future exp', () => {
  it('returns valid: true with correct expiresAt, isExpired: false, isExpiringSoon: false', () => {
    const exp = nowSec() + 3600 // 1 hour from now
    const token = makeJwt({ sub: 'user1', exp })

    const result = decodeJwt(token)

    expect(result.valid).toBe(true)
    expect(result.isExpired).toBe(false)
    expect(result.isExpiringSoon).toBe(false)
    expect(result.expiresAt).toBeInstanceOf(Date)
    // Allow a small tolerance for execution time
    expect(result.expiresAt!.getTime()).toBeCloseTo(exp * 1000, -2)
  })

  it('expiresAt matches the exp claim converted to milliseconds', () => {
    const exp = nowSec() + 7200 // 2 hours from now
    const token = makeJwt({ exp })

    const { expiresAt } = decodeJwt(token)

    expect(expiresAt).toBeDefined()
    expect(expiresAt!.getTime()).toBe(exp * 1000)
  })
})

// ---------------------------------------------------------------------------
// Expired JWT
// ---------------------------------------------------------------------------

describe('decodeJwt — expired JWT', () => {
  it('returns valid: true, isExpired: true when exp is in the past', () => {
    const exp = nowSec() - 3600 // 1 hour ago
    const token = makeJwt({ sub: 'user1', exp })

    const result = decodeJwt(token)

    expect(result.valid).toBe(true)
    expect(result.isExpired).toBe(true)
    expect(result.isExpiringSoon).toBe(false)
    expect(result.expiresAt).toBeInstanceOf(Date)
  })

  it('returns isExpired: true even when exp is only 1 second in the past', () => {
    const exp = nowSec() - 1
    const token = makeJwt({ exp })

    const result = decodeJwt(token)

    expect(result.isExpired).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// JWT expiring soon (< 5 minutes)
// ---------------------------------------------------------------------------

describe('decodeJwt — JWT expiring in less than 5 minutes', () => {
  it('returns isExpiringSoon: true, isExpired: false when exp is ~4 minutes away', () => {
    const exp = nowSec() + 240 // 4 minutes from now
    const token = makeJwt({ exp })

    const result = decodeJwt(token)

    expect(result.valid).toBe(true)
    expect(result.isExpiringSoon).toBe(true)
    expect(result.isExpired).toBe(false)
  })

  it('returns isExpiringSoon: true when exp is 1 second away', () => {
    const exp = nowSec() + 1
    const token = makeJwt({ exp })

    const result = decodeJwt(token)

    expect(result.isExpiringSoon).toBe(true)
    expect(result.isExpired).toBe(false)
  })

  it('returns isExpiringSoon: false when exp is well over 5 minutes away', () => {
    const exp = nowSec() + 600 // 10 minutes from now — safely above the 5-min threshold
    const token = makeJwt({ exp })

    const result = decodeJwt(token)

    expect(result.isExpiringSoon).toBe(false)
    expect(result.isExpired).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Missing `exp` claim
// ---------------------------------------------------------------------------

describe('decodeJwt — missing exp claim', () => {
  it('returns valid: true, expiresAt: undefined, isExpired: false, isExpiringSoon: false', () => {
    const token = makeJwt({ sub: 'user1', role: 'admin' }) // no `exp`

    const result = decodeJwt(token)

    expect(result.valid).toBe(true)
    expect(result.expiresAt).toBeUndefined()
    expect(result.isExpired).toBe(false)
    expect(result.isExpiringSoon).toBe(false)
  })

  it('treats a payload with null exp the same as missing exp — valid: true, no expiry', () => {
    const token = makeJwt({ sub: 'user1', exp: null })

    const result = decodeJwt(token)

    expect(result.valid).toBe(true)
    expect(result.expiresAt).toBeUndefined()
    expect(result.isExpired).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Malformed segments
// ---------------------------------------------------------------------------

describe('decodeJwt — malformed segments', () => {
  it('returns valid: false for a token with only one segment (no dots)', () => {
    const result = decodeJwt('onlyone')

    expect(result.valid).toBe(false)
    expect(result.isExpired).toBe(false)
    expect(result.isExpiringSoon).toBe(false)
  })

  it('returns valid: false for a token with exactly two segments (one dot)', () => {
    const result = decodeJwt('header.payload')

    expect(result.valid).toBe(false)
  })

  it('returns valid: false for a token with four segments (three dots)', () => {
    const result = decodeJwt('a.b.c.d')

    expect(result.valid).toBe(false)
  })

  it('returns valid: false for a token that is only dots', () => {
    const result = decodeJwt('...')

    expect(result.valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Empty string
// ---------------------------------------------------------------------------

describe('decodeJwt — empty string', () => {
  it('returns valid: false for an empty string', () => {
    const result = decodeJwt('')

    expect(result.valid).toBe(false)
    expect(result.isExpired).toBe(false)
    expect(result.isExpiringSoon).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Non-base64 / non-JSON payload
// ---------------------------------------------------------------------------

describe('decodeJwt — non-base64 or non-JSON payload', () => {
  it('returns valid: false when the payload segment is not valid base64', () => {
    // Use characters that are not valid in base64url (`!`, `@`)
    const result = decodeJwt('validheader.!!!invalid!!!.signature')

    expect(result.valid).toBe(false)
  })

  it('returns valid: false when the payload decodes from base64 but is not JSON', () => {
    // "not-json" base64url-encoded is valid base64 but not a JSON object
    const notJson = btoa('this is not json').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const result = decodeJwt(`header.${notJson}.signature`)

    expect(result.valid).toBe(false)
  })

  it('returns valid: false when the payload decodes to a JSON array (not an object)', () => {
    const arrayPayload = btoa(JSON.stringify([1, 2, 3]))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    const result = decodeJwt(`header.${arrayPayload}.signature`)

    expect(result.valid).toBe(false)
  })

  it('returns valid: false when the payload decodes to a JSON primitive (not an object)', () => {
    const primitivePayload = btoa(JSON.stringify(42))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    const result = decodeJwt(`header.${primitivePayload}.signature`)

    expect(result.valid).toBe(false)
  })

  it('returns valid: false when exp claim is a non-numeric type', () => {
    const token = makeJwt({ exp: 'not-a-number' })

    const result = decodeJwt(token)

    expect(result.valid).toBe(false)
  })
})
