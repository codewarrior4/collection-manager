import type { JwtInfo } from '../types'

/**
 * Decode a base64url-encoded string to a UTF-8 string.
 * base64url uses `-` and `_` instead of `+` and `/`, and omits padding `=`.
 */
function decodeBase64Url(input: string): string {
  // Normalize base64url to standard base64
  const base64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), '=')

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

/**
 * Decode a JWT token and return structured info about its validity and expiry.
 *
 * Does NOT verify the signature — only decodes the payload claims.
 *
 * Returns `{ valid: false, isExpired: false, isExpiringSoon: false }` if:
 *   - The token does not have exactly 3 dot-separated segments
 *   - The payload (second segment) is not valid base64url-encoded JSON
 *
 * Requirements: 5.4, 5.6, 5.7
 */
export function decodeJwt(token: string): JwtInfo {
  const invalid: JwtInfo = { valid: false, isExpired: false, isExpiringSoon: false }

  if (!token || typeof token !== 'string') {
    return invalid
  }

  const segments = token.split('.')
  if (segments.length !== 3) {
    return invalid
  }

  // Decode and parse the payload (second segment)
  let payload: Record<string, unknown>
  try {
    const decoded = decodeBase64Url(segments[1])
    const parsed = JSON.parse(decoded)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return invalid
    }
    payload = parsed as Record<string, unknown>
  } catch {
    return invalid
  }

  // Extract `exp` claim if present
  const exp = payload['exp']

  if (exp === undefined || exp === null) {
    // No expiry claim — token is valid but never expires
    return {
      valid: true,
      expiresAt: undefined,
      isExpired: false,
      isExpiringSoon: false,
    }
  }

  if (typeof exp !== 'number') {
    // `exp` exists but is not a number — treat as invalid
    return invalid
  }

  const expiresAt = new Date(exp * 1000)
  const now = new Date()
  const fiveMinutesMs = 5 * 60 * 1000

  const isExpired = expiresAt <= now
  const isExpiringSoon = !isExpired && expiresAt.getTime() - now.getTime() < fiveMinutesMs

  return {
    valid: true,
    expiresAt,
    isExpired,
    isExpiringSoon,
  }
}
