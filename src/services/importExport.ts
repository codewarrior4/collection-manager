import yaml from 'js-yaml'
import type { Collection, Folder, Request, HttpMethod, KeyValue } from '../types/index'
import { generateUUID } from '../utils/uuid'

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

// ---------------------------------------------------------------------------
// Native format: serialize / deserialize
// ---------------------------------------------------------------------------

/**
 * Serialize a Collection to its native JSON string representation.
 */
export function serializeCollection(collection: Collection): string {
  return JSON.stringify(collection)
}

/**
 * Deserialize a native-format JSON string back to a Collection.
 * Throws ImportError if the JSON is invalid or the structure is wrong.
 */
export function deserializeCollection(json: string): Collection {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new ImportError('Invalid JSON: could not parse the file.')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ImportError('Invalid format: expected a JSON object.')
  }

  const obj = parsed as Record<string, unknown>

  if (typeof obj['id'] !== 'string') {
    throw new ImportError('Invalid format: missing or non-string "id" field.')
  }
  if (typeof obj['name'] !== 'string') {
    throw new ImportError('Invalid format: missing or non-string "name" field.')
  }
  if (!Array.isArray(obj['folders'])) {
    throw new ImportError('Invalid format: missing or non-array "folders" field.')
  }
  if (!Array.isArray(obj['requests'])) {
    throw new ImportError('Invalid format: missing or non-array "requests" field.')
  }

  return parsed as Collection
}

// ---------------------------------------------------------------------------
// Postman Collection v2.1 import
// ---------------------------------------------------------------------------

interface PostmanHeader {
  key: string
  value: string
  disabled?: boolean
}

interface PostmanBody {
  mode?: string
  raw?: string
  formdata?: Array<{ key: string; value: string; disabled?: boolean }>
  urlencoded?: Array<{ key: string; value: string; disabled?: boolean }>
}

interface PostmanUrl {
  raw?: string
}

interface PostmanRequest {
  method?: string
  url?: string | PostmanUrl
  header?: PostmanHeader[]
  body?: PostmanBody
}

interface PostmanItem {
  name?: string
  request?: PostmanRequest
  item?: PostmanItem[]
}

interface PostmanCollection {
  info?: { name?: string }
  item?: PostmanItem[]
}

function mapPostmanHeaders(headers: PostmanHeader[] | undefined): KeyValue[] {
  if (!headers) return []
  return headers.map((h) => ({
    key: h.key ?? '',
    value: h.value ?? '',
    enabled: !h.disabled,
  }))
}

function mapPostmanBody(body: PostmanBody | undefined): Request['body'] {
  if (!body) return { type: 'json', content: '' }

  if (body.mode === 'raw') {
    return { type: 'json', content: body.raw ?? '' }
  }
  if (body.mode === 'formdata') {
    return { type: 'form', content: JSON.stringify(body.formdata ?? []) }
  }
  if (body.mode === 'urlencoded') {
    return { type: 'x-www-form-urlencoded', content: JSON.stringify(body.urlencoded ?? []) }
  }

  return { type: 'json', content: '' }
}

function mapPostmanUrl(url: string | PostmanUrl | undefined): string {
  if (!url) return ''
  if (typeof url === 'string') return url
  return url.raw ?? ''
}

const VALID_HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

function normalizeMethod(method: string | undefined): HttpMethod {
  const upper = (method ?? 'GET').toUpperCase()
  if ((VALID_HTTP_METHODS as string[]).includes(upper)) {
    return upper as HttpMethod
  }
  return 'GET'
}

function mapPostmanItem(item: PostmanItem): Request | Folder | null {
  // Folder: has nested items array
  if (Array.isArray(item.item)) {
    const folder: Folder = {
      id: generateUUID(),
      name: item.name ?? 'Untitled Folder',
      folders: [],
      requests: [],
    }
    for (const child of item.item) {
      const mapped = mapPostmanItem(child)
      if (mapped === null) continue
      if ('method' in mapped) {
        folder.requests.push(mapped as Request)
      } else {
        folder.folders.push(mapped as Folder)
      }
    }
    return folder
  }

  // Request item
  const req = item.request
  const request: Request = {
    id: generateUUID(),
    name: item.name ?? 'Untitled Request',
    method: normalizeMethod(req?.method),
    url: mapPostmanUrl(req?.url),
    headers: mapPostmanHeaders(req?.header),
    body: mapPostmanBody(req?.body),
    auth: { type: 'none' },
  }
  return request
}

/**
 * Import a Postman Collection v2.1 JSON string and convert it to the
 * native Collection format. Throws ImportError if the format is not
 * recognised as Postman v2.1.
 */
export function importPostmanV21(json: string): Collection {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new ImportError('Invalid JSON: could not parse the Postman collection file.')
  }

  const data = parsed as PostmanCollection

  if (!data || typeof data !== 'object') {
    throw new ImportError('Invalid Postman format: expected a JSON object.')
  }
  if (!data.info || typeof data.info !== 'object') {
    throw new ImportError('Invalid Postman format: missing "info" field. This does not appear to be a Postman Collection v2.1 file.')
  }
  if (!Array.isArray(data.item)) {
    throw new ImportError('Invalid Postman format: missing "item" array. This does not appear to be a Postman Collection v2.1 file.')
  }

  const collection: Collection = {
    id: generateUUID(),
    name: data.info.name ?? 'Imported Collection',
    folders: [],
    requests: [],
  }

  for (const item of data.item) {
    const mapped = mapPostmanItem(item)
    if (mapped === null) continue
    if ('method' in mapped) {
      collection.requests.push(mapped as Request)
    } else {
      collection.folders.push(mapped as Folder)
    }
  }

  return collection
}

// ---------------------------------------------------------------------------
// OpenAPI 3.x / Swagger 2.x import
// ---------------------------------------------------------------------------

type OpenApiDoc = Record<string, unknown>

const OPENAPI_HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

function buildOpenApiUrl(doc: OpenApiDoc, path: string): string {
  // OpenAPI 3.x
  if (typeof doc['openapi'] === 'string') {
    const servers = doc['servers'] as Array<{ url?: string }> | undefined
    const base = Array.isArray(servers) && servers.length > 0
      ? (servers[0].url ?? '')
      : ''
    return base + path
  }

  // Swagger 2.x
  if (typeof doc['swagger'] === 'string') {
    const host = (doc['host'] as string | undefined) ?? ''
    const basePath = (doc['basePath'] as string | undefined) ?? ''
    if (host) {
      const scheme = Array.isArray(doc['schemes']) && (doc['schemes'] as string[]).length > 0
        ? (doc['schemes'] as string[])[0]
        : 'https'
      return `${scheme}://${host}${basePath}${path}`
    }
    return basePath + path
  }

  return path
}

/**
 * Import an OpenAPI 3.x or Swagger 2.x YAML (or JSON) string and convert
 * it to the native Collection format. Each path/operation becomes one Request.
 * Throws ImportError if the file is not a recognisable OpenAPI/Swagger document.
 */
export function importOpenApi(yaml_or_json: string): Collection {
  let doc: unknown
  try {
    doc = yaml.load(yaml_or_json)
  } catch {
    throw new ImportError('Could not parse the file as YAML or JSON.')
  }

  if (!doc || typeof doc !== 'object') {
    throw new ImportError('Invalid OpenAPI/Swagger format: expected a YAML/JSON object.')
  }

  const apiDoc = doc as OpenApiDoc

  const isOpenApi3 = typeof apiDoc['openapi'] === 'string' && (apiDoc['openapi'] as string).startsWith('3.')
  const isSwagger2 = typeof apiDoc['swagger'] === 'string' && (apiDoc['swagger'] as string).startsWith('2.')

  if (!isOpenApi3 && !isSwagger2) {
    throw new ImportError(
      'Unsupported format: the file does not contain a recognised "openapi" (3.x) or "swagger" (2.x) version field.'
    )
  }

  const paths = apiDoc['paths'] as Record<string, Record<string, unknown>> | undefined
  if (!paths || typeof paths !== 'object') {
    throw new ImportError('Invalid OpenAPI/Swagger format: missing "paths" object.')
  }

  const info = apiDoc['info'] as Record<string, unknown> | undefined
  const collectionName = (typeof info?.['title'] === 'string' ? info['title'] : null) ?? 'Imported API'

  const requests: Request[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue

    for (const verb of OPENAPI_HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[verb] as Record<string, unknown> | undefined
      if (!operation) continue

      const operationId = typeof operation['operationId'] === 'string'
        ? operation['operationId']
        : `${verb.toUpperCase()} ${path}`

      const request: Request = {
        id: generateUUID(),
        name: operationId,
        method: verb.toUpperCase() as HttpMethod,
        url: buildOpenApiUrl(apiDoc, path),
        headers: [],
        body: { type: 'json', content: '' },
        auth: { type: 'none' },
      }

      requests.push(request)
    }
  }

  const collection: Collection = {
    id: generateUUID(),
    name: collectionName,
    folders: [],
    requests,
  }

  return collection
}
