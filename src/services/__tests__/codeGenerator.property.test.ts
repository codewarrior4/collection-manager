// Feature: postman, Property 5: Code Generator Covers All Targets With Language-Appropriate Output

/**
 * Property-based tests for `src/services/codeGenerator.ts`
 *
 * Property 5: Code Generator Covers All Targets With Language-Appropriate Output
 *   For any Request with a valid HTTP method and URL, generateSnippet() must
 *   return a non-empty string for every one of the 22 CodeTarget values, and
 *   each returned string must contain a target-specific structural token that
 *   confirms the correct builder was invoked.
 *
 * Validates: Requirements 7.1, 7.7
 *
 * Minimum iterations: 100 (configured via fc.configureGlobal)
 */

import * as fc from 'fast-check'
import { describe, it, expect, beforeAll } from 'vitest'
import { generateSnippet } from '../codeGenerator'
import type { CodeTarget, HttpMethod, Request } from '../../types'

// ---------------------------------------------------------------------------
// fast-check global configuration — minimum 100 iterations per property
// ---------------------------------------------------------------------------
beforeAll(() => {
  fc.configureGlobal({ numRuns: 100 })
})

// ---------------------------------------------------------------------------
// Target → expected structural token mapping (22 targets)
// ---------------------------------------------------------------------------

/**
 * Each entry declares the CodeTarget value and the structural token that MUST
 * appear in the output to prove the correct builder ran.  These tokens are
 * taken directly from Property 5 in the design document.
 */
const TARGET_TOKENS: ReadonlyArray<{ target: CodeTarget; token: string }> = [
  // Original five
  { target: 'curl',                         token: 'curl' },
  { target: 'php-curl',                     token: '<?php' },
  { target: 'laravel',                      token: 'Http::' },
  { target: 'js-fetch',                     token: 'fetch(' },
  { target: 'axios',                        token: 'axios(' },
  // Backend languages
  { target: 'python-requests',              token: 'requests.' },
  { target: 'python-httpx',                 token: 'httpx.' },
  { target: 'ruby-net-http',                token: 'Net::HTTP' },
  { target: 'ruby-faraday',                 token: 'Faraday' },
  { target: 'go-net-http',                  token: 'http.NewRequest' },
  { target: 'java-okhttp',                  token: 'OkHttpClient' },
  { target: 'java-unirest',                 token: 'Unirest.' },
  { target: 'csharp-httpclient',            token: 'HttpClient' },
  { target: 'rust-reqwest',                 token: 'reqwest::' },
  // JavaScript ecosystem
  { target: 'node-fetch',                   token: 'node-fetch' },
  { target: 'got',                          token: 'got.' },
  { target: 'ky',                           token: 'ky.' },
  // Mobile
  { target: 'swift-urlsession',             token: 'URLSession' },
  { target: 'kotlin-okhttp',                token: 'OkHttpClient' },
  // Other
  // dart-http emits `http.Request` only for methods with a body (POST/PUT/PATCH).
  // We use POST with a non-empty body to guarantee this path is always exercised.
  { target: 'dart-http',                    token: 'http.Request' },
  { target: 'r-httr',                       token: 'httr::' },
  { target: 'powershell-invoke-webrequest', token: 'Invoke-WebRequest' },
]

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** All valid HTTP methods supported by the application. */
const httpMethodArb = fc.constantFrom<HttpMethod>('GET', 'POST', 'PUT', 'PATCH', 'DELETE')

/**
 * Generates a plausible absolute URL.  We keep the structure simple so every
 * builder can embed it verbatim without triggering edge-case escaping logic
 * that might obscure the structural-token assertion.
 */
const urlArb = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    fc.stringMatching(/^[a-z][a-z0-9-]{2,15}$/),
    fc.constantFrom('.com', '.io', '.dev', '.org'),
    fc.stringMatching(/^[a-z][a-z0-9/_-]{0,19}$/),
  )
  .map(([scheme, host, tld, path]) => `${scheme}://${host}${tld}/${path}`)

/** Body type values available in the Request type. */
const bodyTypeArb = fc.constantFrom<Request['body']['type']>(
  'json',
  'form',
  'x-www-form-urlencoded',
)

/**
 * Generates a Request with:
 *  - POST method (ensures all builders exercise body-handling paths,
 *    which is necessary for dart-http to emit `http.Request`)
 *  - arbitrary but valid URL
 *  - arbitrary body type
 *  - empty headers and auth:none (auth injection is tested separately in
 *    the unit test suite; this property focuses on target coverage)
 */
const requestArb: fc.Arbitrary<Request> = fc
  .record({
    method: fc.constant<HttpMethod>('POST'),
    url: urlArb,
    bodyType: bodyTypeArb,
  })
  .map(({ method, url, bodyType }) => ({
    id: 'prop-test-id',
    name: 'Property Test Request',
    method,
    url,
    headers: [],
    body: {
      type: bodyType,
      // Provide a non-empty body string so dart-http always takes the
      // `http.Request` branch rather than the `http.post()` shortcut.
      content: bodyType === 'json' ? '{"prop":true}' : 'field=value',
    },
    auth: { type: 'none' },
  }))

/**
 * Extended arbitrary that also varies the HTTP method across all five values.
 * Used in the "all methods" property to ensure no builder throws for any
 * method/target combination — but we assert only non-empty output there,
 * not the structural token (dart-http may not emit `http.Request` for GET).
 */
const requestAllMethodsArb: fc.Arbitrary<Request> = fc
  .record({
    method: httpMethodArb,
    url: urlArb,
    bodyType: bodyTypeArb,
  })
  .map(({ method, url, bodyType }) => ({
    id: 'prop-test-id',
    name: 'Property Test Request',
    method,
    url,
    headers: [],
    body: { type: bodyType, content: bodyType === 'json' ? '{"x":1}' : 'a=b' },
    auth: { type: 'none' },
  }))

// ---------------------------------------------------------------------------
// Property 5a: Every target returns a non-empty string
// ---------------------------------------------------------------------------

describe('Property 5 — Code Generator Covers All Targets With Language-Appropriate Output', () => {
  it(
    'returns a non-empty string for every CodeTarget value on any valid POST Request',
    () => {
      fc.assert(
        fc.property(requestArb, (request) => {
          for (const { target } of TARGET_TOKENS) {
            const snippet = generateSnippet(request, null, target)

            expect(
              snippet.length > 0,
              `generateSnippet returned empty string for target '${target}'`,
            ).toBe(true)
          }
        }),
      )
    },
  )

  // ---------------------------------------------------------------------------
  // Property 5b: Each target's output contains its structural token
  // ---------------------------------------------------------------------------

  it(
    'output for each CodeTarget contains the expected structural token',
    () => {
      fc.assert(
        fc.property(requestArb, (request) => {
          for (const { target, token } of TARGET_TOKENS) {
            const snippet = generateSnippet(request, null, target)

            expect(
              snippet.includes(token),
              `Target '${target}': expected structural token '${token}' not found.\n` +
              `Request: ${JSON.stringify({ method: request.method, url: request.url })}\n` +
              `Snippet (first 200 chars): ${snippet.slice(0, 200)}`,
            ).toBe(true)
          }
        }),
      )
    },
  )

  // ---------------------------------------------------------------------------
  // Property 5c: generateSnippet never throws for any method / target combo
  // ---------------------------------------------------------------------------

  it(
    'never throws for any combination of HttpMethod and CodeTarget',
    () => {
      fc.assert(
        fc.property(requestAllMethodsArb, (request) => {
          for (const { target } of TARGET_TOKENS) {
            expect(
              () => generateSnippet(request, null, target),
              `generateSnippet should not throw for method '${request.method}' / target '${target}'`,
            ).not.toThrow()
          }
        }),
      )
    },
  )

  // ---------------------------------------------------------------------------
  // Property 5d: The URL appears in every snippet
  //   Any well-formed URL passed in the request should be embedded in the
  //   generated code so a developer can execute it.
  // ---------------------------------------------------------------------------

  it(
    'embeds the request URL in the generated snippet for every CodeTarget',
    () => {
      fc.assert(
        fc.property(requestArb, (request) => {
          for (const { target } of TARGET_TOKENS) {
            const snippet = generateSnippet(request, null, target)

            expect(
              snippet.includes(request.url),
              `Target '${target}': URL '${request.url}' not found in snippet.\n` +
              `Snippet (first 200 chars): ${snippet.slice(0, 200)}`,
            ).toBe(true)
          }
        }),
      )
    },
  )

  // ---------------------------------------------------------------------------
  // Property 5e: No target produces duplicate output for distinct CodeTargets
  //   Given a fixed request, all 22 snippets must NOT all be identical to each
  //   other — each builder must produce genuinely different code.  (We check
  //   that the set of unique snippets has more than one element.)
  // ---------------------------------------------------------------------------

  it(
    'produces distinct output for different CodeTargets on the same Request',
    () => {
      fc.assert(
        fc.property(requestArb, (request) => {
          const snippets = TARGET_TOKENS.map(({ target }) =>
            generateSnippet(request, null, target),
          )
          const uniqueSnippets = new Set(snippets)

          // With 22 targets each using different syntax, there must be more
          // than one unique snippet.
          expect(
            uniqueSnippets.size > 1,
            'All 22 targets produced identical output — builders are not distinct',
          ).toBe(true)
        }),
      )
    },
  )
})

// ---------------------------------------------------------------------------
// Feature: postman, Property 12: Code Generator Applies Variable Substitution
// ---------------------------------------------------------------------------

/**
 * Property 12: Code Generator Applies Variable Substitution
 *
 *   For any Request containing {{key}} tokens in its URL, headers, or body,
 *   and an Environment with a matching variable for that key,
 *   generateSnippet(request, env, target) SHALL return a string that does NOT
 *   contain {{key}} for any key present in the environment's variable set.
 *
 * **Validates: Requirements 7.2**
 *
 * Minimum iterations: 100
 */

import type { Environment } from '../../types'

// ---------------------------------------------------------------------------
// Arbitraries for Property 12
// ---------------------------------------------------------------------------

/**
 * Generates a safe variable key: starts with a letter, followed by letters,
 * digits, or underscores.  This matches the typical `{{token}}` usage in
 * real-world Postman environments and avoids regex-special characters.
 */
const varKeyArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/)

/**
 * Generates a plain replacement value that contains no `{{…}}` sequences so
 * the substitution result is always clean and deterministic.
 */
const varValueArb = fc.stringMatching(/^[a-zA-Z0-9._/-]{1,30}$/)

/**
 * Generates one or more variable key-value pairs, all enabled.
 */
const envVarsArb = fc
  .uniqueArray(varKeyArb, { minLength: 1, maxLength: 5 })
  .chain((keys) =>
    fc
      .tuple(...keys.map(() => varValueArb))
      .map((values) =>
        keys.map((key, i) => ({ key, value: values[i], enabled: true as const })),
      ),
  )

/**
 * Embeds the supplied `{{key}}` tokens into a URL, some header values, and
 * the body, then returns a fully structured Request.
 *
 * Strategy:
 *  - URL:     `https://example.com/{{key0}}/path`
 *  - Headers: one header per key beyond the first, value = `{{keyN}}`
 *  - Body:    `{"field":"{{key0}}"}` (JSON) so every target exercises body handling
 */
function buildRequestWithTokens(
  keys: string[],
  bodyType: Request['body']['type'],
): Request {
  const [firstKey, ...restKeys] = keys

  const url = `https://example.com/{{${firstKey}}}/resource`

  const headers = restKeys.map((k, i) => ({
    key: `X-Header-${i}`,
    value: `{{${k}}}`,
    enabled: true as const,
  }))

  const content =
    bodyType === 'json'
      ? `{"token":"{{${firstKey}}}"}`
      : `field={{${firstKey}}}`

  return {
    id: 'prop12-test-id',
    name: 'Property 12 Test Request',
    method: 'POST' as const,
    url,
    headers,
    body: { type: bodyType, content },
    auth: { type: 'none' },
  }
}

/**
 * Master arbitrary: generates a paired (request, environment) where every
 * `{{key}}` token in the request has a matching enabled variable in the env.
 */
const requestWithEnvArb: fc.Arbitrary<{ request: Request; env: Environment }> = fc
  .record({
    vars: envVarsArb,
    bodyType: bodyTypeArb,
  })
  .map(({ vars, bodyType }) => {
    const keys = vars.map((v) => v.key)
    const request = buildRequestWithTokens(keys, bodyType)
    const env: Environment = {
      id: 'prop12-env-id',
      name: 'Prop12 Env',
      variables: vars,
    }
    return { request, env }
  })

// ---------------------------------------------------------------------------
// Property 12: no unresolved {{key}} tokens survive in any target's snippet
// ---------------------------------------------------------------------------

describe('Property 12 — Code Generator Applies Variable Substitution', () => {
  it(
    'generated snippet contains no unresolved {{key}} tokens for any key present in the environment',
    () => {
      fc.assert(
        fc.property(requestWithEnvArb, ({ request, env }) => {
          const envKeys = env.variables
            .filter((v) => v.enabled)
            .map((v) => v.key)

          for (const { target } of TARGET_TOKENS) {
            const snippet = generateSnippet(request, env, target)

            for (const key of envKeys) {
              const unresolvedToken = `{{${key}}}`
              expect(
                snippet.includes(unresolvedToken),
                `Target '${target}': unresolved token '${unresolvedToken}' found in snippet.\n` +
                  `Request URL: ${request.url}\n` +
                  `Env keys: ${envKeys.join(', ')}\n` +
                  `Snippet (first 300 chars): ${snippet.slice(0, 300)}`,
              ).toBe(false)
            }
          }
        }),
        { numRuns: 100 },
      )
    },
  )
})
