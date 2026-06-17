import { describe, it, expect } from 'vitest'
import {
  serializeCollection,
  deserializeCollection,
  importPostmanV21,
  importOpenApi,
  ImportError,
} from '../importExport'
import type { Collection, Folder, Request } from '../../types/index'

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: 'req-1',
    name: 'Get Users',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
    body: { type: 'json', content: '' },
    auth: { type: 'none' },
    ...overrides,
  }
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Users',
    folders: [],
    requests: [makeRequest()],
    ...overrides,
  }
}

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    name: 'My API',
    folders: [makeFolder()],
    requests: [
      makeRequest({ id: 'req-top', name: 'Root Request', url: 'https://api.example.com/health' }),
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Native format: serialize / deserialize
// ---------------------------------------------------------------------------

describe('serializeCollection', () => {
  it('produces valid JSON containing all collection fields', () => {
    const col = makeCollection()
    const json = serializeCollection(col)
    expect(() => JSON.parse(json)).not.toThrow()
    const parsed = JSON.parse(json)
    expect(parsed.id).toBe(col.id)
    expect(parsed.name).toBe(col.name)
  })

  it('preserves nested folders and requests', () => {
    const col = makeCollection()
    const parsed = JSON.parse(serializeCollection(col))
    expect(parsed.folders).toHaveLength(1)
    expect(parsed.folders[0].name).toBe('Users')
    expect(parsed.folders[0].requests).toHaveLength(1)
    expect(parsed.requests).toHaveLength(1)
  })
})

describe('deserializeCollection', () => {
  it('round-trips a simple collection', () => {
    const col = makeCollection()
    const result = deserializeCollection(serializeCollection(col))
    expect(result).toEqual(col)
  })

  it('round-trips a deeply nested collection', () => {
    const nested: Collection = makeCollection({
      id: 'deep-col',
      name: 'Deep',
      folders: [
        makeFolder({
          id: 'f1',
          name: 'Level 1',
          folders: [
            makeFolder({
              id: 'f2',
              name: 'Level 2',
              folders: [],
              requests: [makeRequest({ id: 'r-deep', name: 'Deep Request' })],
            }),
          ],
          requests: [],
        }),
      ],
      requests: [],
    })
    const result = deserializeCollection(serializeCollection(nested))
    expect(result).toEqual(nested)
  })

  it('preserves all request fields through round-trip', () => {
    const col = makeCollection({
      requests: [
        makeRequest({
          id: 'full-req',
          name: 'Create User',
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: [
            { key: 'Content-Type', value: 'application/json', enabled: true },
            { key: 'X-Disabled', value: 'ignored', enabled: false },
          ],
          body: { type: 'json', content: '{"name":"Alice"}' },
          auth: { type: 'bearer', token: 'my-token' },
        }),
      ],
      folders: [],
    })
    const result = deserializeCollection(serializeCollection(col))
    expect(result).toEqual(col)
  })

  it('throws ImportError on invalid JSON', () => {
    expect(() => deserializeCollection('not json {')).toThrow(ImportError)
    expect(() => deserializeCollection('not json {')).toThrow('Invalid JSON')
  })

  it('throws ImportError when root is not an object', () => {
    expect(() => deserializeCollection('"just a string"')).toThrow(ImportError)
    expect(() => deserializeCollection('42')).toThrow(ImportError)
    expect(() => deserializeCollection('null')).toThrow(ImportError)
  })

  it('throws ImportError when "id" field is missing', () => {
    const json = JSON.stringify({ name: 'No ID', folders: [], requests: [] })
    expect(() => deserializeCollection(json)).toThrow(ImportError)
    expect(() => deserializeCollection(json)).toThrow('id')
  })

  it('throws ImportError when "name" field is missing', () => {
    const json = JSON.stringify({ id: 'x', folders: [], requests: [] })
    expect(() => deserializeCollection(json)).toThrow(ImportError)
    expect(() => deserializeCollection(json)).toThrow('name')
  })

  it('throws ImportError when "folders" field is missing', () => {
    const json = JSON.stringify({ id: 'x', name: 'Test', requests: [] })
    expect(() => deserializeCollection(json)).toThrow(ImportError)
    expect(() => deserializeCollection(json)).toThrow('folders')
  })

  it('throws ImportError when "requests" field is missing', () => {
    const json = JSON.stringify({ id: 'x', name: 'Test', folders: [] })
    expect(() => deserializeCollection(json)).toThrow(ImportError)
    expect(() => deserializeCollection(json)).toThrow('requests')
  })

  it('throws ImportError when "folders" is not an array', () => {
    const json = JSON.stringify({ id: 'x', name: 'Test', folders: {}, requests: [] })
    expect(() => deserializeCollection(json)).toThrow(ImportError)
  })
})

// ---------------------------------------------------------------------------
// Postman Collection v2.1 import
// ---------------------------------------------------------------------------

const POSTMAN_V21_FIXTURE = {
  info: {
    name: 'Petstore API',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    {
      name: 'List Pets',
      request: {
        method: 'GET',
        url: { raw: 'https://petstore.example.com/pets' },
        header: [
          { key: 'Accept', value: 'application/json', disabled: false },
          { key: 'X-Api-Key', value: 'secret', disabled: true },
        ],
        body: undefined,
      },
    },
    {
      name: 'Create Pet',
      request: {
        method: 'POST',
        url: 'https://petstore.example.com/pets',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: '{"name":"Fido"}' },
      },
    },
    {
      name: 'Pet Actions',
      item: [
        {
          name: 'Delete Pet',
          request: {
            method: 'DELETE',
            url: { raw: 'https://petstore.example.com/pets/1' },
            header: [],
          },
        },
      ],
    },
  ],
}

describe('importPostmanV21', () => {
  it('sets the collection name from info.name', () => {
    const col = importPostmanV21(JSON.stringify(POSTMAN_V21_FIXTURE))
    expect(col.name).toBe('Petstore API')
  })

  it('assigns a unique UUID id to the collection', () => {
    const col = importPostmanV21(JSON.stringify(POSTMAN_V21_FIXTURE))
    expect(typeof col.id).toBe('string')
    expect(col.id.length).toBeGreaterThan(0)
  })

  it('maps top-level request items correctly', () => {
    const col = importPostmanV21(JSON.stringify(POSTMAN_V21_FIXTURE))
    expect(col.requests).toHaveLength(2)
    const [listPets, createPet] = col.requests
    expect(listPets.name).toBe('List Pets')
    expect(listPets.method).toBe('GET')
    expect(listPets.url).toBe('https://petstore.example.com/pets')
    expect(createPet.name).toBe('Create Pet')
    expect(createPet.method).toBe('POST')
  })

  it('maps folder (nested item array) correctly', () => {
    const col = importPostmanV21(JSON.stringify(POSTMAN_V21_FIXTURE))
    expect(col.folders).toHaveLength(1)
    const folder = col.folders[0]
    expect(folder.name).toBe('Pet Actions')
    expect(folder.requests).toHaveLength(1)
    expect(folder.requests[0].name).toBe('Delete Pet')
    expect(folder.requests[0].method).toBe('DELETE')
  })

  it('maps url object (raw field) to string', () => {
    const col = importPostmanV21(JSON.stringify(POSTMAN_V21_FIXTURE))
    expect(col.requests[0].url).toBe('https://petstore.example.com/pets')
    expect(col.folders[0].requests[0].url).toBe('https://petstore.example.com/pets/1')
  })

  it('maps request headers including disabled state', () => {
    const col = importPostmanV21(JSON.stringify(POSTMAN_V21_FIXTURE))
    const headers = col.requests[0].headers
    expect(headers).toHaveLength(2)
    expect(headers[0]).toEqual({ key: 'Accept', value: 'application/json', enabled: true })
    expect(headers[1]).toEqual({ key: 'X-Api-Key', value: 'secret', enabled: false })
  })

  it('maps raw body to json body type', () => {
    const col = importPostmanV21(JSON.stringify(POSTMAN_V21_FIXTURE))
    const createPet = col.requests[1]
    expect(createPet.body.type).toBe('json')
    expect(createPet.body.content).toBe('{"name":"Fido"}')
  })

  it('maps formdata body type', () => {
    const fixture = {
      info: { name: 'Form API' },
      item: [
        {
          name: 'Upload',
          request: {
            method: 'POST',
            url: 'https://example.com/upload',
            header: [],
            body: {
              mode: 'formdata',
              formdata: [{ key: 'file', value: 'data', disabled: false }],
            },
          },
        },
      ],
    }
    const col = importPostmanV21(JSON.stringify(fixture))
    expect(col.requests[0].body.type).toBe('form')
  })

  it('maps urlencoded body type', () => {
    const fixture = {
      info: { name: 'Encoded API' },
      item: [
        {
          name: 'Submit',
          request: {
            method: 'POST',
            url: 'https://example.com/submit',
            header: [],
            body: {
              mode: 'urlencoded',
              urlencoded: [{ key: 'q', value: 'test' }],
            },
          },
        },
      ],
    }
    const col = importPostmanV21(JSON.stringify(fixture))
    expect(col.requests[0].body.type).toBe('x-www-form-urlencoded')
  })

  it('normalises unknown HTTP methods to GET', () => {
    const fixture = {
      info: { name: 'Odd Methods' },
      item: [
        {
          name: 'Custom',
          request: { method: 'PROPFIND', url: 'https://example.com' },
        },
      ],
    }
    const col = importPostmanV21(JSON.stringify(fixture))
    expect(col.requests[0].method).toBe('GET')
  })

  it('defaults collection name to "Imported Collection" when info.name is absent', () => {
    const fixture = { info: {}, item: [] }
    const col = importPostmanV21(JSON.stringify(fixture))
    expect(col.name).toBe('Imported Collection')
  })

  it('throws ImportError on invalid JSON', () => {
    expect(() => importPostmanV21('not valid json')).toThrow(ImportError)
    expect(() => importPostmanV21('not valid json')).toThrow('Invalid JSON')
  })

  it('throws ImportError when "info" field is missing', () => {
    const json = JSON.stringify({ item: [] })
    expect(() => importPostmanV21(json)).toThrow(ImportError)
    expect(() => importPostmanV21(json)).toThrow('info')
  })

  it('throws ImportError when "item" array is missing', () => {
    const json = JSON.stringify({ info: { name: 'No Items' } })
    expect(() => importPostmanV21(json)).toThrow(ImportError)
    expect(() => importPostmanV21(json)).toThrow('item')
  })

  it('assigns new UUIDs to all nodes (not reusing original ids)', () => {
    const col1 = importPostmanV21(JSON.stringify(POSTMAN_V21_FIXTURE))
    const col2 = importPostmanV21(JSON.stringify(POSTMAN_V21_FIXTURE))
    // Every import should generate fresh UUIDs — collection ids differ across imports
    expect(col1.id).not.toBe(col2.id)
    expect(col1.requests[0].id).not.toBe(col2.requests[0].id)
    expect(col1.folders[0].id).not.toBe(col2.folders[0].id)
  })
})

// ---------------------------------------------------------------------------
// OpenAPI 3.x YAML import
// ---------------------------------------------------------------------------

const OPENAPI_3_YAML = `
openapi: "3.0.3"
info:
  title: Pet Store
  version: "1.0.0"
servers:
  - url: https://petstore.example.com
paths:
  /pets:
    get:
      operationId: listPets
      summary: List all pets
    post:
      operationId: createPet
      summary: Create a pet
  /pets/{petId}:
    get:
      operationId: showPetById
      summary: Info for a specific pet
    delete:
      operationId: deletePet
      summary: Delete a pet
`

const SWAGGER_2_YAML = `
swagger: "2.0"
info:
  title: Widget API
  version: "1.0"
host: api.example.com
basePath: /v1
schemes:
  - https
paths:
  /widgets:
    get:
      operationId: listWidgets
      summary: List widgets
`

describe('importOpenApi', () => {
  it('sets collection name from info.title', () => {
    const col = importOpenApi(OPENAPI_3_YAML)
    expect(col.name).toBe('Pet Store')
  })

  it('assigns a unique UUID id to the collection', () => {
    const col = importOpenApi(OPENAPI_3_YAML)
    expect(typeof col.id).toBe('string')
    expect(col.id.length).toBeGreaterThan(0)
  })

  it('maps each path/operation to one Request', () => {
    const col = importOpenApi(OPENAPI_3_YAML)
    // /pets GET + POST + /pets/{petId} GET + DELETE = 4 requests
    expect(col.requests).toHaveLength(4)
    expect(col.folders).toHaveLength(0)
  })

  it('uses operationId as the request name', () => {
    const col = importOpenApi(OPENAPI_3_YAML)
    const names = col.requests.map((r) => r.name)
    expect(names).toContain('listPets')
    expect(names).toContain('createPet')
    expect(names).toContain('showPetById')
    expect(names).toContain('deletePet')
  })

  it('maps HTTP methods correctly', () => {
    const col = importOpenApi(OPENAPI_3_YAML)
    const byName = Object.fromEntries(col.requests.map((r) => [r.name, r.method]))
    expect(byName['listPets']).toBe('GET')
    expect(byName['createPet']).toBe('POST')
    expect(byName['deletePet']).toBe('DELETE')
  })

  it('prepends server URL to path', () => {
    const col = importOpenApi(OPENAPI_3_YAML)
    const listPets = col.requests.find((r) => r.name === 'listPets')!
    expect(listPets.url).toBe('https://petstore.example.com/pets')
  })

  it('falls back to operationId-style name when operationId is absent', () => {
    const yaml = `
openapi: "3.0.3"
info:
  title: Minimal API
servers:
  - url: https://example.com
paths:
  /items:
    get:
      summary: List items
`
    const col = importOpenApi(yaml)
    expect(col.requests).toHaveLength(1)
    expect(col.requests[0].name).toBe('GET /items')
  })

  it('defaults collection name to "Imported API" when info.title is absent', () => {
    const yaml = `
openapi: "3.0.3"
info:
  version: "1.0"
paths:
  /ping:
    get:
      operationId: ping
`
    const col = importOpenApi(yaml)
    expect(col.name).toBe('Imported API')
  })

  it('assigns new UUIDs to all requests across imports', () => {
    const col1 = importOpenApi(OPENAPI_3_YAML)
    const col2 = importOpenApi(OPENAPI_3_YAML)
    expect(col1.id).not.toBe(col2.id)
    expect(col1.requests[0].id).not.toBe(col2.requests[0].id)
  })

  it('supports Swagger 2.x YAML format', () => {
    const col = importOpenApi(SWAGGER_2_YAML)
    expect(col.name).toBe('Widget API')
    expect(col.requests).toHaveLength(1)
    expect(col.requests[0].name).toBe('listWidgets')
  })

  it('builds full URL from Swagger 2.x host + basePath + path', () => {
    const col = importOpenApi(SWAGGER_2_YAML)
    expect(col.requests[0].url).toBe('https://api.example.com/v1/widgets')
  })

  it('parses OpenAPI supplied as JSON (not YAML)', () => {
    const json = JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'JSON API' },
      servers: [{ url: 'https://json.example.com' }],
      paths: {
        '/data': {
          get: { operationId: 'getData' },
        },
      },
    })
    const col = importOpenApi(json)
    expect(col.name).toBe('JSON API')
    expect(col.requests[0].name).toBe('getData')
  })

  it('throws ImportError on unparseable YAML', () => {
    // Intentionally break YAML with an unclosed mapping
    const broken = 'paths:\n  /foo:\n    - bad: [unclosed'
    expect(() => importOpenApi(broken)).toThrow(ImportError)
  })

  it('throws ImportError when neither openapi nor swagger version field is present', () => {
    const yaml = `
info:
  title: Mystery Format
paths:
  /foo:
    get:
      operationId: foo
`
    expect(() => importOpenApi(yaml)).toThrow(ImportError)
    expect(() => importOpenApi(yaml)).toThrow('Unsupported format')
  })

  it('throws ImportError for OpenAPI version 2.x with openapi key (not swagger)', () => {
    // openapi key but not starting with "3."
    const json = JSON.stringify({
      openapi: '2.0',
      info: { title: 'Old Format' },
      paths: {},
    })
    expect(() => importOpenApi(json)).toThrow(ImportError)
  })

  it('throws ImportError when paths object is missing', () => {
    const yaml = `
openapi: "3.0.3"
info:
  title: No Paths API
`
    expect(() => importOpenApi(yaml)).toThrow(ImportError)
    expect(() => importOpenApi(yaml)).toThrow('paths')
  })

  it('only maps recognised HTTP verbs (get/post/put/patch/delete)', () => {
    const yaml = `
openapi: "3.0.3"
info:
  title: Verbs API
paths:
  /items:
    get:
      operationId: listItems
    head:
      operationId: headItems
    options:
      operationId: optionsItems
`
    const col = importOpenApi(yaml)
    // Only GET should be mapped; HEAD and OPTIONS are not in the supported list
    expect(col.requests).toHaveLength(1)
    expect(col.requests[0].name).toBe('listItems')
  })
})
