/**
 * Unit tests for `src/services/httpClient.ts`
 *
 * Covers:
 *  - Bearer token injected when JWT is valid (non-expired)
 *  - Bearer token NOT injected when JWT is expired
 *  - Bearer token NOT injected when no jwtToken on env
 *  - Basic auth encodes username:password as base64
 *  - Variable substitution is applied to URL, headers, and body before dispatch
 *  - AxiosError maps to { status: 0, body: errorMessage }
 *  - Non-AxiosError maps to { status: 0, body: errorMessage }
 *
 * Requirements: 2.12, 5.3, 5.6
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import axios, { AxiosError } from 'axios'
import { sendRequest } from '../httpClient'
import type { Request, Environment } from '../../types'

// ---------------------------------------------------------------------------
// Mock axios
// ---------------------------------------------------------------------------

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios')
  const mockFn = vi.fn()
  return {
    default: Object.assign(mockFn, {
      // AxiosError needs to be accessible for instanceof checks inside httpClient
      AxiosError: actual.AxiosError,
    }),
    AxiosError: actual.AxiosError,
  }
})

const mockedAxios = axios as unknown as MockedFunction<typeof axios>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nowSec = () => Math.floor(Date.now() / 1000)

/** Build a syntactically valid JWT with an arbitrary payload. */
function makeJwt(payload: object): string {
  const toBase64Url = (str: string) =>
    btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = toBase64Url(JSON.stringify(payload))
  return `${header}.${body}.fakesignature`
}

/** Build a minimal valid Request object. */
function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://example.com/api',
    headers: [],
    body: { type: 'json', content: '' },
    auth: { type: 'none' },
    ...overrides,
  }
}

/** Minimal fake axios response. */
function fakeAxiosResponse(status = 200, data = '{"ok":true}') {
  return {
    status,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    data,
    config: {},
  }
}

/** Capture the headers that were passed to the mocked axios call. */
function capturedHeaders(): Record<string, string> {
  const callArg = mockedAxios.mock.calls[0]?.[0] as { headers?: Record<string, string> }
  return callArg?.headers ?? {}
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockedAxios.mockResolvedValue(fakeAxiosResponse())
})

// ---------------------------------------------------------------------------
// Bearer token injection — valid JWT (non-expired)
// ---------------------------------------------------------------------------

describe('sendRequest — bearer auth with valid (non-expired) JWT', () => {
  it('injects Authorization: Bearer <token> header when JWT is valid and not expired', async () => {
    const jwtToken = makeJwt({ sub: 'user1', exp: nowSec() + 3600 })
    const request = makeRequest({ auth: { type: 'bearer' } })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [],
      jwtToken,
    }

    await sendRequest(request, env)

    const headers = capturedHeaders()
    expect(headers['Authorization']).toBe(`Bearer ${jwtToken}`)
  })

  it('does not inject Authorization header when auth type is none', async () => {
    const jwtToken = makeJwt({ sub: 'user1', exp: nowSec() + 3600 })
    const request = makeRequest({ auth: { type: 'none' } })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [],
      jwtToken,
    }

    await sendRequest(request, env)

    const headers = capturedHeaders()
    expect(headers['Authorization']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Bearer token NOT injected — expired JWT
// ---------------------------------------------------------------------------

describe('sendRequest — bearer auth with expired JWT', () => {
  it('does NOT inject Authorization header when JWT is expired', async () => {
    const jwtToken = makeJwt({ sub: 'user1', exp: nowSec() - 3600 }) // 1 hour ago
    const request = makeRequest({ auth: { type: 'bearer' } })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [],
      jwtToken,
    }

    await sendRequest(request, env)

    const headers = capturedHeaders()
    expect(headers['Authorization']).toBeUndefined()
  })

  it('does NOT inject Authorization header when jwtToken is absent from env', async () => {
    const request = makeRequest({ auth: { type: 'bearer' } })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [],
      // no jwtToken field
    }

    await sendRequest(request, env)

    const headers = capturedHeaders()
    expect(headers['Authorization']).toBeUndefined()
  })

  it('does NOT inject Authorization header when env is null', async () => {
    const request = makeRequest({ auth: { type: 'bearer' } })

    await sendRequest(request, null)

    const headers = capturedHeaders()
    expect(headers['Authorization']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Basic auth — base64 encoding
// ---------------------------------------------------------------------------

describe('sendRequest — basic auth', () => {
  it('injects Authorization: Basic <base64(user:pass)> header', async () => {
    const username = 'alice'
    const password = 's3cr3t'
    const request = makeRequest({
      auth: { type: 'basic', username, password },
    })

    await sendRequest(request, null)

    const headers = capturedHeaders()
    const expected = `Basic ${btoa(`${username}:${password}`)}`
    expect(headers['Authorization']).toBe(expected)
  })

  it('handles empty username and password (Basic encoding of colon)', async () => {
    const request = makeRequest({
      auth: { type: 'basic', username: '', password: '' },
    })

    await sendRequest(request, null)

    const headers = capturedHeaders()
    expect(headers['Authorization']).toBe(`Basic ${btoa(':')}`)
  })

  it('handles username with no password field set', async () => {
    const request = makeRequest({
      auth: { type: 'basic', username: 'bob' },
    })

    await sendRequest(request, null)

    const headers = capturedHeaders()
    // password defaults to empty string → "bob:"
    expect(headers['Authorization']).toBe(`Basic ${btoa('bob:')}`)
  })
})

// ---------------------------------------------------------------------------
// Variable substitution applied before dispatch
// ---------------------------------------------------------------------------

describe('sendRequest — variable substitution', () => {
  it('substitutes {{variable}} tokens in the URL before dispatch', async () => {
    const request = makeRequest({ url: 'https://{{host}}/api' })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [{ key: 'host', value: 'example.com', enabled: true }],
    }

    await sendRequest(request, env)

    const callArg = mockedAxios.mock.calls[0]?.[0] as { url?: string }
    expect(callArg?.url).toBe('https://example.com/api')
  })

  it('substitutes {{variable}} tokens in header values before dispatch', async () => {
    const request = makeRequest({
      headers: [{ key: 'X-Api-Key', value: '{{apiKey}}', enabled: true }],
    })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [{ key: 'apiKey', value: 'secret-key-123', enabled: true }],
    }

    await sendRequest(request, env)

    const headers = capturedHeaders()
    expect(headers['X-Api-Key']).toBe('secret-key-123')
  })

  it('substitutes {{variable}} tokens in body content before dispatch', async () => {
    const request = makeRequest({
      method: 'POST',
      body: { type: 'json', content: '{"userId":"{{userId}}"}' },
    })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [{ key: 'userId', value: '42', enabled: true }],
    }

    await sendRequest(request, env)

    const callArg = mockedAxios.mock.calls[0]?.[0] as { data?: string }
    expect(callArg?.data).toBe('{"userId":"42"}')
  })

  it('leaves unresolved tokens unchanged in the URL', async () => {
    const request = makeRequest({ url: 'https://{{host}}/api' })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [], // no matching variable
    }

    await sendRequest(request, env)

    const callArg = mockedAxios.mock.calls[0]?.[0] as { url?: string }
    expect(callArg?.url).toBe('https://{{host}}/api')
  })

  it('disabled variables are not substituted', async () => {
    const request = makeRequest({ url: 'https://{{host}}/api' })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [{ key: 'host', value: 'example.com', enabled: false }],
    }

    await sendRequest(request, env)

    const callArg = mockedAxios.mock.calls[0]?.[0] as { url?: string }
    expect(callArg?.url).toBe('https://{{host}}/api')
  })
})

// ---------------------------------------------------------------------------
// AxiosError maps to status 0
// ---------------------------------------------------------------------------

describe('sendRequest — AxiosError handling', () => {
  it('returns status 0 and the error message when axios throws an AxiosError', async () => {
    const errorMessage = 'Network Error'
    const axiosError = new AxiosError(errorMessage)
    mockedAxios.mockRejectedValue(axiosError)

    const request = makeRequest()
    const result = await sendRequest(request, null)

    expect(result.status).toBe(0)
    expect(result.statusText).toBe('Network Error')
    expect(result.body).toBe(errorMessage)
    expect(result.headers).toEqual({})
    expect(typeof result.timeMs).toBe('number')
  })

  it('returns status 0 and statusText "Network Error" for connection refused AxiosError', async () => {
    const axiosError = new AxiosError('connect ECONNREFUSED 127.0.0.1:3000')
    mockedAxios.mockRejectedValue(axiosError)

    const result = await sendRequest(makeRequest(), null)

    expect(result.status).toBe(0)
    expect(result.body).toBe('connect ECONNREFUSED 127.0.0.1:3000')
  })

  it('returns status 0 for non-AxiosError (generic Error)', async () => {
    mockedAxios.mockRejectedValue(new Error('Something unexpected'))

    const result = await sendRequest(makeRequest(), null)

    expect(result.status).toBe(0)
    expect(result.body).toBe('Something unexpected')
  })
})

// ---------------------------------------------------------------------------
// Successful response mapping
// ---------------------------------------------------------------------------

describe('sendRequest — successful response mapping', () => {
  it('maps axios response status, statusText, headers, body, and timeMs to SendResult', async () => {
    mockedAxios.mockResolvedValue({
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'application/json', 'x-request-id': 'abc123' },
      data: '{"id":1}',
      config: {},
    })

    const result = await sendRequest(makeRequest({ method: 'POST' }), null)

    expect(result.status).toBe(201)
    expect(result.statusText).toBe('Created')
    expect(result.headers['content-type']).toBe('application/json')
    expect(result.headers['x-request-id']).toBe('abc123')
    expect(result.body).toBe('{"id":1}')
    expect(typeof result.timeMs).toBe('number')
    expect(result.timeMs).toBeGreaterThanOrEqual(0)
  })

  it('does not include disabled headers in the dispatch', async () => {
    const request = makeRequest({
      headers: [
        { key: 'X-Enabled', value: 'yes', enabled: true },
        { key: 'X-Disabled', value: 'no', enabled: false },
      ],
    })

    await sendRequest(request, null)

    const headers = capturedHeaders()
    expect(headers['X-Enabled']).toBe('yes')
    expect(headers['X-Disabled']).toBeUndefined()
  })

  it('does not mutate the original request object', async () => {
    const original = makeRequest({
      url: 'https://{{host}}/api',
      headers: [{ key: 'X-Key', value: '{{token}}', enabled: true }],
      body: { type: 'json', content: '{"user":"{{name}}"}' },
    })
    const env: Environment = {
      id: 'env-1',
      name: 'Test',
      variables: [
        { key: 'host', value: 'replaced.com', enabled: true },
        { key: 'token', value: 'tok-abc', enabled: true },
        { key: 'name', value: 'Alice', enabled: true },
      ],
    }

    // Keep a snapshot before sending
    const originalUrl = original.url
    const originalHeaderValue = original.headers[0].value
    const originalBodyContent = original.body.content

    await sendRequest(original, env)

    expect(original.url).toBe(originalUrl)
    expect(original.headers[0].value).toBe(originalHeaderValue)
    expect(original.body.content).toBe(originalBodyContent)
  })
})
