/**
 * Unit tests for `src/services/codeGenerator.ts`
 *
 * Covers:
 *  - One example per target (all 22 CodeTarget values)
 *  - Auth injection: bearer (valid non-expired JWT), basic, none
 *  - Body types: json, form, x-www-form-urlencoded
 *  - Variable substitution applied to URL and headers
 *
 * Requirements: 7.1, 7.2, 7.3, 7.7
 */

import { describe, it, expect } from 'vitest'
import { generateSnippet } from '../codeGenerator'
import type { CodeTarget, Request, Environment } from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a syntactically valid JWT with a future or past `exp` claim.
 * @param expOffsetSeconds - seconds from now (positive = future, negative = past)
 */
function makeJwt(expOffsetSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  const payload = btoa(
    JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }),
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${header}.${payload}.fakesig`
}

/** Create a minimal Request object with sensible defaults. */
function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [],
    body: { type: 'json', content: '' },
    auth: { type: 'none' },
    ...overrides,
  }
}

/** Create a minimal Environment object. */
function makeEnv(variables: Array<{ key: string; value: string; enabled?: boolean }> = []): Environment {
  return {
    id: 'env-1',
    name: 'Test Env',
    variables: variables.map((v) => ({ key: v.key, value: v.value, enabled: v.enabled ?? true })),
  }
}

// ---------------------------------------------------------------------------
// 1. One example per target — all 22 CodeTarget values
// ---------------------------------------------------------------------------

const targetTokens: Array<{ target: CodeTarget; token: string }> = [
  { target: 'curl', token: 'curl' },
  { target: 'php-curl', token: '<?php' },
  { target: 'laravel', token: 'Http::' },
  { target: 'js-fetch', token: 'fetch(' },
  { target: 'axios', token: 'axios(' },
  { target: 'python-requests', token: 'requests.' },
  { target: 'python-httpx', token: 'httpx.' },
  { target: 'ruby-net-http', token: 'Net::HTTP' },
  { target: 'ruby-faraday', token: 'Faraday' },
  { target: 'go-net-http', token: 'http.NewRequest' },
  { target: 'java-okhttp', token: 'OkHttpClient' },
  { target: 'java-unirest', token: 'Unirest.' },
  { target: 'csharp-httpclient', token: 'HttpClient' },
  { target: 'rust-reqwest', token: 'reqwest::' },
  { target: 'node-fetch', token: 'node-fetch' },
  { target: 'got', token: 'got.' },
  { target: 'ky', token: 'ky.' },
  { target: 'swift-urlsession', token: 'URLSession' },
  { target: 'kotlin-okhttp', token: 'OkHttpClient' },
  // dart-http only uses http.Request when method has a body (POST/PUT/PATCH).
  // For GET requests it falls back to http.get(). Use POST to trigger http.Request path.
  { target: 'dart-http', token: 'http.Request' },
  { target: 'r-httr', token: 'httr::' },
  { target: 'powershell-invoke-webrequest', token: 'Invoke-WebRequest' },
]

describe('generateSnippet — one example per target (all 22 targets)', () => {
  // Use POST with a body so that all builders exercise their body-handling paths.
  // dart-http only emits http.Request when there is a body; GET falls back to http.get().
  const request = makeRequest({
    method: 'POST',
    body: { type: 'json', content: '{"ping":true}' },
  })

  for (const { target, token } of targetTokens) {
    it(`target '${target}' produces non-empty output containing '${token}'`, () => {
      const snippet = generateSnippet(request, null, target)
      expect(snippet).toBeTruthy()
      expect(snippet).toContain(token)
    })
  }
})

// ---------------------------------------------------------------------------
// 2. Auth injection — bearer
// ---------------------------------------------------------------------------

describe('generateSnippet — auth injection: bearer', () => {
  it('injects Authorization: Bearer header when token is valid and non-expired', () => {
    const jwt = makeJwt(3600) // expires 1 hour from now
    const request = makeRequest({
      method: 'POST',
      auth: { type: 'bearer', token: jwt },
      body: { type: 'json', content: '{"x":1}' },
    })

    const snippet = generateSnippet(request, null, 'curl')

    expect(snippet).toContain('Authorization')
    expect(snippet).toContain('Bearer')
    expect(snippet).toContain(jwt)
  })

  it('injects bearer auth for multiple targets', () => {
    const jwt = makeJwt(3600)
    const request = makeRequest({
      method: 'GET',
      auth: { type: 'bearer', token: jwt },
    })

    for (const { target } of targetTokens) {
      const snippet = generateSnippet(request, null, target)
      expect(snippet).toContain('Authorization')
      expect(snippet).toContain('Bearer')
    }
  })

  it('falls back to jwtToken from environment when auth.token is absent', () => {
    const jwt = makeJwt(3600)
    const request = makeRequest({ auth: { type: 'bearer' } })
    const env: Environment = { ...makeEnv(), jwtToken: jwt }

    const snippet = generateSnippet(request, env, 'curl')

    expect(snippet).toContain('Authorization')
    expect(snippet).toContain('Bearer')
    expect(snippet).toContain(jwt)
  })

  it('does NOT inject bearer header when the JWT is expired', () => {
    const expiredJwt = makeJwt(-3600) // expired 1 hour ago
    const request = makeRequest({ auth: { type: 'bearer', token: expiredJwt } })

    const snippet = generateSnippet(request, null, 'curl')

    // No Authorization header should be present for an expired token
    expect(snippet).not.toContain('Authorization: Bearer')
  })
})

// ---------------------------------------------------------------------------
// 3. Auth injection — basic
// ---------------------------------------------------------------------------

describe('generateSnippet — auth injection: basic', () => {
  it('injects Authorization: Basic header with base64-encoded credentials', () => {
    const request = makeRequest({
      auth: { type: 'basic', username: 'admin', password: 's3cret' },
    })

    const snippet = generateSnippet(request, null, 'curl')
    const expectedEncoded = btoa('admin:s3cret')

    expect(snippet).toContain('Authorization')
    expect(snippet).toContain('Basic')
    expect(snippet).toContain(expectedEncoded)
  })

  it('injects basic auth for multiple targets', () => {
    const request = makeRequest({
      auth: { type: 'basic', username: 'user', password: 'pass' },
    })

    for (const { target } of targetTokens) {
      const snippet = generateSnippet(request, null, target)
      expect(snippet).toContain('Authorization')
      expect(snippet).toContain('Basic')
    }
  })

  it('handles empty credentials in basic auth (still injects header)', () => {
    const request = makeRequest({ auth: { type: 'basic', username: '', password: '' } })

    const snippet = generateSnippet(request, null, 'js-fetch')
    const expectedEncoded = btoa(':')

    expect(snippet).toContain('Authorization')
    expect(snippet).toContain('Basic')
    expect(snippet).toContain(expectedEncoded)
  })
})

// ---------------------------------------------------------------------------
// 4. Auth injection — none
// ---------------------------------------------------------------------------

describe('generateSnippet — auth injection: none', () => {
  it('does not inject Authorization: Bearer when auth.type is none', () => {
    const request = makeRequest({ auth: { type: 'none' } })

    for (const { target } of targetTokens) {
      const snippet = generateSnippet(request, null, target)
      expect(snippet).not.toContain('Authorization: Bearer')
    }
  })

  it('does not inject Authorization: Basic when auth.type is none', () => {
    const request = makeRequest({ auth: { type: 'none' } })

    for (const { target } of targetTokens) {
      const snippet = generateSnippet(request, null, target)
      expect(snippet).not.toContain('Authorization: Basic')
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Body type — json
// ---------------------------------------------------------------------------

describe('generateSnippet — body type: json', () => {
  it('includes JSON body content in the generated snippet (curl)', () => {
    const jsonBody = '{"name":"Alice","age":30}'
    const request = makeRequest({
      method: 'POST',
      body: { type: 'json', content: jsonBody },
      auth: { type: 'none' },
    })

    const snippet = generateSnippet(request, null, 'curl')

    expect(snippet).toContain(jsonBody)
  })

  it('includes JSON body content for js-fetch target', () => {
    const jsonBody = '{"key":"value"}'
    const request = makeRequest({
      method: 'POST',
      body: { type: 'json', content: jsonBody },
    })

    const snippet = generateSnippet(request, null, 'js-fetch')

    // js-fetch puts the raw string into the fetch options body property and
    // JSON.stringify serializes it with escaped quotes: {"key":"value"} → {\"key\":\"value\"}
    expect(snippet).toContain('\\"key\\"')
    expect(snippet).toContain('\\"value\\"')
  })

  it('includes JSON body content for python-requests target', () => {
    const jsonBody = '{"query":"test"}'
    const request = makeRequest({
      method: 'PUT',
      body: { type: 'json', content: jsonBody },
    })

    const snippet = generateSnippet(request, null, 'python-requests')

    expect(snippet).toContain('json=')
    expect(snippet).toContain(jsonBody)
  })

  it('includes JSON body content for axios target', () => {
    const jsonBody = '{"id":1}'
    const request = makeRequest({
      method: 'POST',
      body: { type: 'json', content: jsonBody },
    })

    const snippet = generateSnippet(request, null, 'axios')

    expect(snippet).toContain('"id"')
  })
})

// ---------------------------------------------------------------------------
// 6. Body type — form
// ---------------------------------------------------------------------------

describe('generateSnippet — body type: form', () => {
  it('includes form body content in the generated snippet (curl)', () => {
    const formBody = 'field1=value1&field2=value2'
    const request = makeRequest({
      method: 'POST',
      body: { type: 'form', content: formBody },
    })

    const snippet = generateSnippet(request, null, 'curl')

    expect(snippet).toContain(formBody)
  })

  it('includes form body content for php-curl target', () => {
    const formBody = 'name=Bob&role=admin'
    const request = makeRequest({
      method: 'POST',
      body: { type: 'form', content: formBody },
    })

    const snippet = generateSnippet(request, null, 'php-curl')

    expect(snippet).toContain(formBody)
  })

  it('includes form body content for python-requests target', () => {
    const formBody = 'username=alice&password=secret'
    const request = makeRequest({
      method: 'POST',
      body: { type: 'form', content: formBody },
    })

    const snippet = generateSnippet(request, null, 'python-requests')

    expect(snippet).toContain('data=')
  })
})

// ---------------------------------------------------------------------------
// 7. Body type — x-www-form-urlencoded
// ---------------------------------------------------------------------------

describe('generateSnippet — body type: x-www-form-urlencoded', () => {
  it('includes urlencoded body content in the generated snippet (curl)', () => {
    const urlencodedBody = 'grant_type=authorization_code&code=abc123'
    const request = makeRequest({
      method: 'POST',
      body: { type: 'x-www-form-urlencoded', content: urlencodedBody },
    })

    const snippet = generateSnippet(request, null, 'curl')

    expect(snippet).toContain(urlencodedBody)
  })

  it('includes urlencoded body content for js-fetch target', () => {
    const urlencodedBody = 'token=xyz&client_id=app1'
    const request = makeRequest({
      method: 'POST',
      body: { type: 'x-www-form-urlencoded', content: urlencodedBody },
    })

    const snippet = generateSnippet(request, null, 'js-fetch')

    expect(snippet).toContain(urlencodedBody)
  })

  it('includes urlencoded body for java-okhttp target', () => {
    const urlencodedBody = 'scope=read+write&client_id=myapp'
    const request = makeRequest({
      method: 'POST',
      body: { type: 'x-www-form-urlencoded', content: urlencodedBody },
    })

    const snippet = generateSnippet(request, null, 'java-okhttp')

    expect(snippet).toContain(urlencodedBody)
  })
})

// ---------------------------------------------------------------------------
// 8. Variable substitution — URL
// ---------------------------------------------------------------------------

describe('generateSnippet — variable substitution: URL', () => {
  it('resolves {{baseUrl}} in URL and produces no unresolved tokens', () => {
    const request = makeRequest({ url: '{{baseUrl}}/api/v1/items' })
    const env = makeEnv([{ key: 'baseUrl', value: 'https://example.com' }])

    const snippet = generateSnippet(request, env, 'curl')

    expect(snippet).toContain('https://example.com/api/v1/items')
    expect(snippet).not.toContain('{{baseUrl}}')
  })

  it('resolves multiple {{tokens}} in URL', () => {
    const request = makeRequest({ url: '{{protocol}}://{{host}}/{{path}}' })
    const env = makeEnv([
      { key: 'protocol', value: 'https' },
      { key: 'host', value: 'api.example.com' },
      { key: 'path', value: 'v2/users' },
    ])

    const snippet = generateSnippet(request, env, 'js-fetch')

    expect(snippet).toContain('https://api.example.com/v2/users')
    expect(snippet).not.toContain('{{protocol}}')
    expect(snippet).not.toContain('{{host}}')
    expect(snippet).not.toContain('{{path}}')
  })

  it('leaves unmatched {{tokens}} in URL unchanged when env has no matching variable', () => {
    const request = makeRequest({ url: '{{unknownVar}}/users' })
    const env = makeEnv([]) // no variables

    const snippet = generateSnippet(request, env, 'curl')

    expect(snippet).toContain('{{unknownVar}}')
  })

  it('resolves URL tokens for multiple targets', () => {
    const request = makeRequest({ url: '{{apiBase}}/endpoint' })
    const env = makeEnv([{ key: 'apiBase', value: 'https://service.io' }])

    for (const { target } of targetTokens) {
      const snippet = generateSnippet(request, env, target)
      expect(snippet).toContain('https://service.io/endpoint')
      expect(snippet).not.toContain('{{apiBase}}')
    }
  })
})

// ---------------------------------------------------------------------------
// 9. Variable substitution — headers
// ---------------------------------------------------------------------------

describe('generateSnippet — variable substitution: headers', () => {
  it('resolves {{token}} in header values', () => {
    const request = makeRequest({
      headers: [
        { key: 'X-Api-Key', value: '{{apiKey}}', enabled: true },
      ],
    })
    const env = makeEnv([{ key: 'apiKey', value: 'super-secret-key-123' }])

    const snippet = generateSnippet(request, env, 'curl')

    expect(snippet).toContain('super-secret-key-123')
    expect(snippet).not.toContain('{{apiKey}}')
  })

  it('resolves multiple header tokens', () => {
    const request = makeRequest({
      headers: [
        { key: 'X-Tenant', value: '{{tenantId}}', enabled: true },
        { key: 'X-Region', value: '{{region}}', enabled: true },
      ],
    })
    const env = makeEnv([
      { key: 'tenantId', value: 'tenant-42' },
      { key: 'region', value: 'eu-west-1' },
    ])

    const snippet = generateSnippet(request, env, 'js-fetch')

    expect(snippet).toContain('tenant-42')
    expect(snippet).toContain('eu-west-1')
    expect(snippet).not.toContain('{{tenantId}}')
    expect(snippet).not.toContain('{{region}}')
  })

  it('does not resolve header tokens for disabled variables', () => {
    const request = makeRequest({
      headers: [{ key: 'X-Key', value: '{{secret}}', enabled: true }],
    })
    const env = makeEnv([{ key: 'secret', value: 'hidden', enabled: false }])

    const snippet = generateSnippet(request, env, 'curl')

    // Unresolved token should remain
    expect(snippet).toContain('{{secret}}')
    expect(snippet).not.toContain('hidden')
  })

  it('does not include disabled headers in generated snippet', () => {
    const request = makeRequest({
      headers: [
        { key: 'X-Active', value: 'yes', enabled: true },
        { key: 'X-Inactive', value: 'no', enabled: false },
      ],
    })

    const snippet = generateSnippet(request, null, 'curl')

    expect(snippet).toContain('X-Active')
    expect(snippet).not.toContain('X-Inactive')
  })

  it('resolves header tokens for multiple targets', () => {
    const request = makeRequest({
      headers: [{ key: 'Accept', value: '{{acceptType}}', enabled: true }],
    })
    const env = makeEnv([{ key: 'acceptType', value: 'application/json' }])

    for (const { target } of targetTokens) {
      const snippet = generateSnippet(request, env, target)
      expect(snippet).toContain('application/json')
      expect(snippet).not.toContain('{{acceptType}}')
    }
  })
})
