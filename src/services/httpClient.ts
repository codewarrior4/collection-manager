import axios, { AxiosError } from 'axios'
import type { Request, Environment, SendResult } from '../types'
import { interpolate } from './variableSubstitution'
import { decodeJwt } from './jwtDecoder'

/**
 * Send an HTTP request with variable substitution and auth injection applied.
 *
 * Steps:
 *  1. Deep-clone the request so the original is never mutated.
 *  2. Run interpolate() on the URL, all header values, and body content.
 *  3. Inject Authorization header based on auth type:
 *     - bearer: only if env has a jwtToken that decodes as non-expired
 *     - basic: base64(username:password)
 *  4. Dispatch via axios and compute timeMs.
 *  5. Map the axios response to SendResult.
 *  6. On AxiosError, return { status: 0, body: descriptiveMessage }.
 *
 * Requirements: 2.3, 2.12, 5.3, 5.6, 8.4
 */
export async function sendRequest(
  request: Request,
  activeEnv: Environment | null,
): Promise<SendResult> {
  // Step 1: deep-clone so we never mutate the caller's object
  const req: Request = JSON.parse(JSON.stringify(request))

  const variables = activeEnv?.variables ?? []

  // Step 2: apply variable substitution to URL, headers, and body content
  req.url = interpolate(req.url, variables).result

  for (const header of req.headers) {
    header.value = interpolate(header.value, variables).result
  }

  req.body.content = interpolate(req.body.content, variables).result

  // Step 3: auth header injection
  const authHeaders: Record<string, string> = {}

  if (req.auth.type === 'bearer') {
    const jwtToken = activeEnv?.jwtToken
    if (jwtToken) {
      const jwtInfo = decodeJwt(jwtToken)
      // Only inject when valid and not expired (requirement 5.6)
      if (jwtInfo.valid && !jwtInfo.isExpired) {
        authHeaders['Authorization'] = `Bearer ${jwtToken}`
      }
    }
  } else if (req.auth.type === 'basic') {
    const username = req.auth.username ?? ''
    const password = req.auth.password ?? ''
    const encoded = btoa(`${username}:${password}`)
    authHeaders['Authorization'] = `Basic ${encoded}`
  }

  // Build the header map for axios (only enabled headers)
  const headerMap: Record<string, string> = {}
  for (const kv of req.headers) {
    if (kv.enabled) {
      headerMap[kv.key] = kv.value
    }
  }
  // Auth headers take precedence over any pre-existing Authorization header
  Object.assign(headerMap, authHeaders)

  // Build request body for axios
  let data: string | undefined
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    if (req.body.type === 'json' && req.body.content.trim()) {
      data = req.body.content
      if (!headerMap['Content-Type'] && !headerMap['content-type']) {
        headerMap['Content-Type'] = 'application/json'
      }
    } else if (
      (req.body.type === 'form' || req.body.type === 'x-www-form-urlencoded') &&
      req.body.content.trim()
    ) {
      data = req.body.content
      if (!headerMap['Content-Type'] && !headerMap['content-type']) {
        headerMap['Content-Type'] = 'application/x-www-form-urlencoded'
      }
    }
  }

  // Step 4: dispatch and time the call
  const start = Date.now()

  try {
    const response = await axios({
      method: req.method.toLowerCase(),
      url: req.url,
      headers: headerMap,
      data,
      // Prevent axios from throwing on non-2xx so we can map status codes ourselves
      validateStatus: () => true,
      // Return raw string so we control JSON parsing
      responseType: 'text',
      transformResponse: [(d) => d],
    })

    const timeMs = Date.now() - start

    // Flatten response headers to Record<string, string>
    const responseHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined && value !== null) {
        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value)
      }
    }

    // Step 5: map to SendResult
    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: typeof response.data === 'string' ? response.data : String(response.data ?? ''),
      timeMs,
    }
  } catch (err) {
    // Step 6: AxiosError → status 0 with descriptive message
    const timeMs = Date.now() - start

    if (err instanceof AxiosError) {
      const message = err.message ?? 'Network error'
      return {
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: message,
        timeMs,
      }
    }

    // Unexpected non-axios error
    const message = err instanceof Error ? err.message : 'Unknown error'
    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: message,
      timeMs,
    }
  }
}
