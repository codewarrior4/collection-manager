// Shared domain types for API Collection Manager

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface KeyValue {
  key: string
  value: string
  enabled: boolean
}

export interface Request {
  id: string // crypto.randomUUID()
  name: string
  method: HttpMethod
  url: string // may contain {{variable}} tokens
  headers: KeyValue[]
  body: {
    type: 'json' | 'form' | 'x-www-form-urlencoded'
    content: string // raw JSON string or serialized form pairs
  }
  auth: {
    type: 'bearer' | 'basic' | 'none'
    token?: string
    username?: string
    password?: string
  }
}

export interface Folder {
  id: string
  name: string
  folders: Folder[] // recursive nesting
  requests: Request[]
}

export interface Collection {
  id: string
  name: string
  folders: Folder[]
  requests: Request[]
}

export interface Environment {
  id: string
  name: string
  variables: KeyValue[]
  jwtToken?: string // raw JWT string
}

// For JWT decoder service
export interface JwtInfo {
  valid: boolean
  expiresAt?: Date
  isExpired: boolean
  isExpiringSoon: boolean // within 5 minutes
}

// For HTTP client service
export interface SendResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  timeMs: number
}

// For code generator service
export type CodeTarget =
  // Original targets
  | 'curl'
  | 'php-curl'
  | 'laravel'
  | 'js-fetch'
  | 'axios'
  // Backend languages
  | 'python-requests'
  | 'python-httpx'
  | 'ruby-net-http'
  | 'ruby-faraday'
  | 'go-net-http'
  | 'java-okhttp'
  | 'java-unirest'
  | 'csharp-httpclient'
  | 'rust-reqwest'
  // JavaScript ecosystem
  | 'node-fetch'
  | 'got'
  | 'ky'
  // Mobile
  | 'swift-urlsession'
  | 'kotlin-okhttp'
  // Other
  | 'dart-http'
  | 'r-httr'
  | 'powershell-invoke-webrequest'
