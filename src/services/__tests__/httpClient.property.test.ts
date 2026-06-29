// Feature: postman, Property 10: Bearer Token Injection Follows JWT Validity

/**
 * Property-based tests for `src/services/httpClient.ts`
 *
 * Property 10: Bearer Token Injection Follows JWT Validity
 *   For any Request with auth.type === 'bearer' and an Environment whose
 *   jwtToken decodes as non-expired (isExpired === false), sendRequest() SHALL
 *   include an `Authorization: Bearer <token>` header in the axios call args.
 *
 *   For any Request with auth.type === 'bearer' and an Environment whose
 *   jwtToken decodes as expired (isExpired === true), sendRequest() SHALL NOT
 *   include an `Authorization` header derived from the JWT.
 *
 * Validates: Requirements 5.3, 5.6
 *
 * Minimum iterations: 100
 */

import * as fc from 'fast-check'
import { describe, expect, it, vi, beforeEach, type MockedFunction } from 'vitest'
import axios from 'axios'
import { sendRequest } from '../httpClient'
import type { Request, Environment, KeyValue } from '../../types'

// ---------------------------------------------------------------------------
// Mock axios — same pattern as the unit tests
// ---------------------------------------------------------------------------

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios')
  const mockFn = vi.fn()
  return {
    default: Object.assign(mockFn, {
      AxiosError: actual.AxiosError,
    }),
    AxiosError: actual.AxiosError,
  }
})

const mockedAxios = axios as unknown as MockedFunction<typeof axios>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nowSec = (): number => Math.floor(Date.now() / 1000)

/**
 * base64url-encode a string (mirrors the production jwtDecoder logic).
 */
function base64urlEncode(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Build a syntactically valid JWT with an arbitrary payload.
 * The signature segment is intentionally fake — httpClient never verifies it.
 */
function buildJwt(payload: Record<string, unknown>): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64urlEncode(JSON.stringify(payload))
  return `${header}.${body}.fakesignature`
}

/** Minimal fake axios success response. */
function fakeAxiosOk() {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    data: '{}',
    config: {},
  }
}

/** Retrieve the headers passed to the mocked axios call. */
function capturedHeaders(): Record<string, string> {
  const callArg = mockedAxios.mock.calls[0]?.[0] as { headers?: Record<string, string> }
  return callArg?.headers ?? {}
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a valid (non-expired) JWT whose exp is at least 310 seconds from
 * now (well past the 5-minute "expiring soon" threshold, so the token is
 * unambiguously valid and non-expired during the test run).
 *
 * We use a generous lower bound (310 s) to avoid any race condition between
 * JWT construction and sendRequest() invocation.
 */
const validJwtArb = fc.integer({ min: 310, max: 365 * 24 * 3600 }).map((secondsAhead) => {
  const exp = nowSec() + secondsAhead
  return buildJwt({ sub: 'test-user', iat: nowSec(), exp })
})

/**
 * Generates an expired JWT whose exp is at least 1 second in the past.
 * We use a past offset of 1..2_000_000 seconds to cover a wide range of
 * "how long ago" the token expired.
 */
const expiredJwtArb = fc.integer({ min: 1, max: 2_000_000 }).map((secondsAgo) => {
  const exp = nowSec() - secondsAgo
  return buildJwt({ sub: 'test-user', iat: nowSec() - secondsAgo - 60, exp })
})

/**
 * Generates a minimal valid Request with auth.type === 'bearer'.
 * URL, headers, and body are kept deterministic and simple so the property
 * focuses entirely on the Authorization header injection logic.
 *
 * We use fc.record to allow fast-check to shrink generated requests on failure.
 */
const bearerRequestArb: fc.Arbitrary<Request> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  method: fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE') as fc.Arbitrary<
    Request['method']
  >,
  url: fc.constant('https://example.com/api/resource'),
  headers: fc.array(
    fc.record({
      key: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,20}$/),
      value: fc.string({ maxLength: 40 }).filter((v) => !v.includes('{{')),
      enabled: fc.boolean(),
    }),
    { minLength: 0, maxLength: 5 },
  ),
  body: fc.record({
    type: fc.constantFrom('json', 'form', 'x-www-form-urlencoded') as fc.Arbitrary<
      Request['body']['type']
    >,
    content: fc.constant(''),
  }),
  auth: fc.constant({ type: 'bearer' as const }),
})

/**
 * Generates an Environment with zero or more variables (no `{{…}}` values to
 * keep the test focused) plus the provided jwtToken.
 */
function envWithJwt(jwtToken: string): fc.Arbitrary<Environment> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    variables: fc.array(
      fc.record({
        key: fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,19}$/),
        value: fc.string({ maxLength: 40 }).filter((v) => !v.includes('{{')),
        enabled: fc.boolean(),
      }),
      { minLength: 0, maxLength: 5 },
    ) as fc.Arbitrary<KeyValue[]>,
  }).map((env) => ({ ...env, jwtToken }))
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockedAxios.mockResolvedValue(fakeAxiosOk())
})

// ---------------------------------------------------------------------------
// Property 10a: Non-expired JWT → Authorization: Bearer <token> is injected
// ---------------------------------------------------------------------------

describe('Property 10 — Bearer Token Injection Follows JWT Validity: non-expired JWT', () => {
  it(
    'includes Authorization: Bearer <token> for any Request with bearer auth and a non-expired JWT',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          bearerRequestArb,
          validJwtArb.chain((jwt) => envWithJwt(jwt).map((env) => ({ jwt, env }))),
          async (request, { jwt, env }) => {
            vi.clearAllMocks()
            mockedAxios.mockResolvedValue(fakeAxiosOk())

            await sendRequest(request, env)

            const headers = capturedHeaders()
            expect(headers['Authorization']).toBe(`Bearer ${jwt}`)
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  it(
    'Authorization header value exactly equals "Bearer " + the raw JWT string (no mutation)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          bearerRequestArb,
          validJwtArb.chain((jwt) => envWithJwt(jwt).map((env) => ({ jwt, env }))),
          async (request, { jwt, env }) => {
            vi.clearAllMocks()
            mockedAxios.mockResolvedValue(fakeAxiosOk())

            await sendRequest(request, env)

            const headers = capturedHeaders()
            // The header value must be exactly "Bearer " + the original token
            // — no trimming, no re-encoding, no modification.
            expect(headers['Authorization']).toBe(`Bearer ${jwt}`)
            expect(headers['Authorization']!.startsWith('Bearer ')).toBe(true)
            const injectedToken = headers['Authorization']!.slice('Bearer '.length)
            expect(injectedToken).toBe(jwt)
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})

// ---------------------------------------------------------------------------
// Property 10b: Expired JWT → No Authorization header is injected
// ---------------------------------------------------------------------------

describe('Property 10 — Bearer Token Injection Follows JWT Validity: expired JWT', () => {
  it(
    'omits Authorization header for any Request with bearer auth and an expired JWT',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          bearerRequestArb,
          expiredJwtArb.chain((jwt) => envWithJwt(jwt).map((env) => ({ jwt, env }))),
          async (request, { env }) => {
            vi.clearAllMocks()
            mockedAxios.mockResolvedValue(fakeAxiosOk())

            // Ensure no pre-existing Authorization header on the request
            const cleanRequest: Request = {
              ...request,
              headers: request.headers.filter(
                (h) => h.key.toLowerCase() !== 'authorization',
              ),
            }

            await sendRequest(cleanRequest, env)

            const headers = capturedHeaders()
            // No Authorization header should be present at all when JWT is expired
            expect(headers['Authorization']).toBeUndefined()
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  it(
    'does not inject a "Bearer " Authorization header regardless of which expired JWT is used',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          bearerRequestArb,
          expiredJwtArb.chain((jwt) => envWithJwt(jwt).map((env) => ({ jwt, env }))),
          async (request, { jwt, env }) => {
            vi.clearAllMocks()
            mockedAxios.mockResolvedValue(fakeAxiosOk())

            const cleanRequest: Request = {
              ...request,
              headers: request.headers.filter(
                (h) => h.key.toLowerCase() !== 'authorization',
              ),
            }

            await sendRequest(cleanRequest, env)

            const headers = capturedHeaders()
            const authHeader = headers['Authorization']

            if (authHeader !== undefined) {
              // If an Authorization header is somehow present, it must NOT be
              // the Bearer token from the expired JWT
              expect(authHeader).not.toBe(`Bearer ${jwt}`)
              expect(authHeader.startsWith('Bearer ')).toBe(false)
            }
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})

// ---------------------------------------------------------------------------
// Property 10c: Absence of environment or jwtToken → no Bearer injection
// ---------------------------------------------------------------------------

describe('Property 10 — Bearer Token Injection Follows JWT Validity: no env / no token', () => {
  it(
    'omits Authorization header when env is null (even with bearer auth type)',
    async () => {
      await fc.assert(
        fc.asyncProperty(bearerRequestArb, async (request) => {
          vi.clearAllMocks()
          mockedAxios.mockResolvedValue(fakeAxiosOk())

          const cleanRequest: Request = {
            ...request,
            headers: request.headers.filter(
              (h) => h.key.toLowerCase() !== 'authorization',
            ),
          }

          await sendRequest(cleanRequest, null)

          const headers = capturedHeaders()
          expect(headers['Authorization']).toBeUndefined()
        }),
        { numRuns: 100 },
      )
    },
  )

  it(
    'omits Authorization header when env has no jwtToken field',
    async () => {
      const envWithoutToken: fc.Arbitrary<Environment> = fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 30 }),
        variables: fc.constant([]),
      })

      await fc.assert(
        fc.asyncProperty(bearerRequestArb, envWithoutToken, async (request, env) => {
          vi.clearAllMocks()
          mockedAxios.mockResolvedValue(fakeAxiosOk())

          const cleanRequest: Request = {
            ...request,
            headers: request.headers.filter(
              (h) => h.key.toLowerCase() !== 'authorization',
            ),
          }

          await sendRequest(cleanRequest, env)

          const headers = capturedHeaders()
          expect(headers['Authorization']).toBeUndefined()
        }),
        { numRuns: 100 },
      )
    },
  )
})

// ---------------------------------------------------------------------------
// Property 10d: auth.type !== 'bearer' → expired/valid JWT is irrelevant;
//               Basic auth uses its own scheme; 'none' has no Authorization
// ---------------------------------------------------------------------------

describe('Property 10 — Bearer Token Injection Follows JWT Validity: non-bearer auth types', () => {
  const nonBearerRequestArb: fc.Arbitrary<Request> = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 40 }),
    method: fc.constantFrom('GET', 'POST') as fc.Arbitrary<Request['method']>,
    url: fc.constant('https://example.com/api'),
    headers: fc.constant([]),
    body: fc.record({
      type: fc.constant('json') as fc.Arbitrary<'json'>,
      content: fc.constant(''),
    }),
    auth: fc.constant({ type: 'none' as const }),
  })

  it(
    'omits Authorization header when auth.type is "none", even if a valid JWT is in the env',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          nonBearerRequestArb,
          validJwtArb.chain((jwt) => envWithJwt(jwt).map((env) => ({ jwt, env }))),
          async (request, { env }) => {
            vi.clearAllMocks()
            mockedAxios.mockResolvedValue(fakeAxiosOk())

            await sendRequest(request, env)

            const headers = capturedHeaders()
            // auth.type === 'none' → no Authorization header regardless of env JWT
            expect(headers['Authorization']).toBeUndefined()
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})
