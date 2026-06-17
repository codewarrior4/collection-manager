/**
 * Integration test: Postman v2.1 import
 *
 * Loads a real Postman v2.1 JSON fixture file and verifies that
 * `importPostmanV21` correctly maps the collection name, folder structure,
 * and request method/URL fields.
 *
 * Validates: Requirements 6.3
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { importPostmanV21 } from '../importExport'
import type { Collection, Folder, Request } from '../../types/index'

// ---------------------------------------------------------------------------
// Load fixture
// ---------------------------------------------------------------------------

const fixturePath = join(__dirname, 'fixtures', 'postman-v2.1.json')
const fixtureJson = readFileSync(fixturePath, 'utf-8')

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Find a top-level folder by name */
function getFolder(collection: Collection, name: string): Folder {
  const folder = collection.folders.find((f) => f.name === name)
  if (!folder) throw new Error(`Folder "${name}" not found in collection`)
  return folder
}

/** Find a nested folder by name within a parent folder */
function getNestedFolder(parent: Folder, name: string): Folder {
  const folder = parent.folders.find((f) => f.name === name)
  if (!folder) throw new Error(`Nested folder "${name}" not found in parent "${parent.name}"`)
  return folder
}

/** Find a request by name within a list */
function getRequest(requests: Request[], name: string): Request {
  const req = requests.find((r) => r.name === name)
  if (!req) throw new Error(`Request "${name}" not found`)
  return req
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('importPostmanV21 — Pet Store API fixture (integration)', () => {
  // Parse once and reuse across all assertions
  let collection: Collection

  it('parses the fixture without throwing', () => {
    expect(() => {
      collection = importPostmanV21(fixtureJson)
    }).not.toThrow()
  })

  // --- Collection-level assertions ---

  it('maps the collection name from info.name', () => {
    const col = importPostmanV21(fixtureJson)
    expect(col.name).toBe('Pet Store API')
  })

  it('assigns a non-empty UUID to the collection', () => {
    const col = importPostmanV21(fixtureJson)
    expect(typeof col.id).toBe('string')
    expect(col.id.length).toBeGreaterThan(0)
    // UUID v4 pattern
    expect(col.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('generates unique collection ids on each import call', () => {
    const col1 = importPostmanV21(fixtureJson)
    const col2 = importPostmanV21(fixtureJson)
    expect(col1.id).not.toBe(col2.id)
  })

  // --- Top-level request assertions ---

  it('places top-level requests (not in any folder) directly on the collection', () => {
    const col = importPostmanV21(fixtureJson)
    // Fixture has 2 top-level request items: "List All Pets" and "Create Pet"
    expect(col.requests).toHaveLength(2)
  })

  it('maps "List All Pets" GET request with correct method and URL', () => {
    const col = importPostmanV21(fixtureJson)
    const req = getRequest(col.requests, 'List All Pets')
    expect(req.method).toBe('GET')
    expect(req.url).toBe('https://api.petstore.example.com/pets?limit=20&offset=0')
  })

  it('maps "Create Pet" POST request with correct method and URL', () => {
    const col = importPostmanV21(fixtureJson)
    const req = getRequest(col.requests, 'Create Pet')
    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://api.petstore.example.com/pets')
  })

  it('maps "Create Pet" raw JSON body to type "json"', () => {
    const col = importPostmanV21(fixtureJson)
    const req = getRequest(col.requests, 'Create Pet')
    expect(req.body.type).toBe('json')
    expect(req.body.content).toBe('{"name": "Buddy", "species": "dog", "age": 3}')
  })

  it('maps enabled and disabled headers on "List All Pets"', () => {
    const col = importPostmanV21(fixtureJson)
    const req = getRequest(col.requests, 'List All Pets')
    expect(req.headers).toHaveLength(3)
    const accept = req.headers.find((h) => h.key === 'Accept')!
    expect(accept.enabled).toBe(true)
    const debug = req.headers.find((h) => h.key === 'X-Debug')!
    expect(debug.enabled).toBe(false)
  })

  // --- Folder structure assertions ---

  it('creates exactly two top-level folders', () => {
    const col = importPostmanV21(fixtureJson)
    // Fixture top-level folders: "Pet Management" and "Store Operations"
    expect(col.folders).toHaveLength(2)
  })

  it('maps the "Pet Management" folder with correct name', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Pet Management')
    expect(folder.name).toBe('Pet Management')
  })

  it('assigns a non-empty UUID to the folder', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Pet Management')
    expect(typeof folder.id).toBe('string')
    expect(folder.id.length).toBeGreaterThan(0)
  })

  it('places requests directly inside "Pet Management" folder', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Pet Management')
    // Fixture has 3 direct requests: Get Pet by ID, Update Pet, Delete Pet
    expect(folder.requests).toHaveLength(3)
  })

  it('maps "Get Pet by ID" GET request inside "Pet Management"', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Pet Management')
    const req = getRequest(folder.requests, 'Get Pet by ID')
    expect(req.method).toBe('GET')
    expect(req.url).toBe('https://api.petstore.example.com/pets/{{petId}}')
  })

  it('maps "Update Pet" PUT request inside "Pet Management"', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Pet Management')
    const req = getRequest(folder.requests, 'Update Pet')
    expect(req.method).toBe('PUT')
    expect(req.url).toBe('https://api.petstore.example.com/pets/{{petId}}')
    expect(req.body.type).toBe('json')
  })

  it('maps "Delete Pet" DELETE request inside "Pet Management"', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Pet Management')
    const req = getRequest(folder.requests, 'Delete Pet')
    expect(req.method).toBe('DELETE')
    expect(req.url).toBe('https://api.petstore.example.com/pets/{{petId}}')
  })

  // --- Nested folder (folder-within-folder) assertions ---

  it('creates the nested "Pet Photos" folder inside "Pet Management"', () => {
    const col = importPostmanV21(fixtureJson)
    const petManagement = getFolder(col, 'Pet Management')
    // "Pet Management" has one nested folder: "Pet Photos"
    expect(petManagement.folders).toHaveLength(1)
    const petPhotos = petManagement.folders[0]
    expect(petPhotos.name).toBe('Pet Photos')
  })

  it('places requests inside the nested "Pet Photos" folder', () => {
    const col = importPostmanV21(fixtureJson)
    const petManagement = getFolder(col, 'Pet Management')
    const petPhotos = getNestedFolder(petManagement, 'Pet Photos')
    expect(petPhotos.requests).toHaveLength(2)
  })

  it('maps "Upload Photo" POST with formdata body in nested folder', () => {
    const col = importPostmanV21(fixtureJson)
    const petManagement = getFolder(col, 'Pet Management')
    const petPhotos = getNestedFolder(petManagement, 'Pet Photos')
    const req = getRequest(petPhotos.requests, 'Upload Photo')
    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://api.petstore.example.com/pets/{{petId}}/photos')
    expect(req.body.type).toBe('form')
  })

  it('maps "List Photos" GET with plain string URL in nested folder', () => {
    const col = importPostmanV21(fixtureJson)
    const petManagement = getFolder(col, 'Pet Management')
    const petPhotos = getNestedFolder(petManagement, 'Pet Photos')
    const req = getRequest(petPhotos.requests, 'List Photos')
    expect(req.method).toBe('GET')
    expect(req.url).toBe('https://api.petstore.example.com/pets/{{petId}}/photos')
  })

  // --- Store Operations folder assertions ---

  it('maps the "Store Operations" folder with correct name', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Store Operations')
    expect(folder.name).toBe('Store Operations')
  })

  it('places two requests inside "Store Operations" folder', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Store Operations')
    expect(folder.requests).toHaveLength(2)
  })

  it('maps "Get Inventory" GET request inside "Store Operations"', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Store Operations')
    const req = getRequest(folder.requests, 'Get Inventory')
    expect(req.method).toBe('GET')
    expect(req.url).toBe('https://api.petstore.example.com/store/inventory')
  })

  it('maps "Place Order" POST with urlencoded body inside "Store Operations"', () => {
    const col = importPostmanV21(fixtureJson)
    const folder = getFolder(col, 'Store Operations')
    const req = getRequest(folder.requests, 'Place Order')
    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://api.petstore.example.com/store/orders')
    expect(req.body.type).toBe('x-www-form-urlencoded')
  })

  // --- UUID uniqueness across nodes ---

  it('assigns unique UUIDs to all nodes (no collisions)', () => {
    const col = importPostmanV21(fixtureJson)

    const ids = new Set<string>()
    ids.add(col.id)

    for (const req of col.requests) ids.add(req.id)

    for (const folder of col.folders) {
      ids.add(folder.id)
      for (const req of folder.requests) ids.add(req.id)
      for (const nested of folder.folders) {
        ids.add(nested.id)
        for (const req of nested.requests) ids.add(req.id)
      }
    }

    // Each node has a unique id — the set size should equal the count of nodes
    const nodeCount = 1 + col.requests.length + col.folders.length +
      col.folders.reduce((acc, f) =>
        acc + f.requests.length + f.folders.length +
        f.folders.reduce((a, nf) => a + nf.requests.length + nf.folders.length, 0), 0)

    expect(ids.size).toBe(nodeCount)
  })
})

// ---------------------------------------------------------------------------
// Integration test: OpenAPI 3.x import
//
// Loads a real OpenAPI 3.x YAML fixture file and verifies that
// `importOpenApi` correctly creates one Request per path/operation with the
// right HTTP method and fully resolved URL.
//
// Validates: Requirements 6.4
// ---------------------------------------------------------------------------

import { importOpenApi } from '../importExport'

const openApiFixturePath = join(__dirname, 'fixtures', 'openapi-3.x.yaml')
const openApiFixtureYaml = readFileSync(openApiFixturePath, 'utf-8')

describe('importOpenApi — Pet Store OpenAPI 3.x fixture (integration)', () => {
  let collection: ReturnType<typeof importOpenApi>

  it('parses the fixture without throwing', () => {
    expect(() => {
      collection = importOpenApi(openApiFixtureYaml)
    }).not.toThrow()
  })

  // --- Collection-level assertions ---

  it('maps the collection name from info.title', () => {
    const col = importOpenApi(openApiFixtureYaml)
    expect(col.name).toBe('Pet Store API')
  })

  it('assigns a non-empty UUID to the collection', () => {
    const col = importOpenApi(openApiFixtureYaml)
    expect(typeof col.id).toBe('string')
    expect(col.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('generates unique collection ids on each import call', () => {
    const col1 = importOpenApi(openApiFixtureYaml)
    const col2 = importOpenApi(openApiFixtureYaml)
    expect(col1.id).not.toBe(col2.id)
  })

  it('places all requests directly on the collection (no folders)', () => {
    const col = importOpenApi(openApiFixtureYaml)
    // The fixture has 9 operations across 5 paths
    expect(col.folders).toHaveLength(0)
    expect(col.requests).toHaveLength(9)
  })

  // --- Per-operation method and URL assertions ---

  it('maps GET /pets → listPets with correct method and URL', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const req = col.requests.find((r) => r.name === 'listPets')
    expect(req).toBeDefined()
    expect(req!.method).toBe('GET')
    expect(req!.url).toBe('https://api.petstore.example.com/v3/pets')
  })

  it('maps POST /pets → createPet with correct method and URL', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const req = col.requests.find((r) => r.name === 'createPet')
    expect(req).toBeDefined()
    expect(req!.method).toBe('POST')
    expect(req!.url).toBe('https://api.petstore.example.com/v3/pets')
  })

  it('maps GET /pets/{petId} → getPetById with correct method and URL', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const req = col.requests.find((r) => r.name === 'getPetById')
    expect(req).toBeDefined()
    expect(req!.method).toBe('GET')
    expect(req!.url).toBe('https://api.petstore.example.com/v3/pets/{petId}')
  })

  it('maps PUT /pets/{petId} → updatePet with correct method and URL', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const req = col.requests.find((r) => r.name === 'updatePet')
    expect(req).toBeDefined()
    expect(req!.method).toBe('PUT')
    expect(req!.url).toBe('https://api.petstore.example.com/v3/pets/{petId}')
  })

  it('maps DELETE /pets/{petId} → deletePet with correct method and URL', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const req = col.requests.find((r) => r.name === 'deletePet')
    expect(req).toBeDefined()
    expect(req!.method).toBe('DELETE')
    expect(req!.url).toBe('https://api.petstore.example.com/v3/pets/{petId}')
  })

  it('maps GET /pets/{petId}/photos → listPetPhotos with correct method and URL', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const req = col.requests.find((r) => r.name === 'listPetPhotos')
    expect(req).toBeDefined()
    expect(req!.method).toBe('GET')
    expect(req!.url).toBe('https://api.petstore.example.com/v3/pets/{petId}/photos')
  })

  it('maps POST /pets/{petId}/photos → uploadPetPhoto with correct method and URL', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const req = col.requests.find((r) => r.name === 'uploadPetPhoto')
    expect(req).toBeDefined()
    expect(req!.method).toBe('POST')
    expect(req!.url).toBe('https://api.petstore.example.com/v3/pets/{petId}/photos')
  })

  it('maps GET /store/inventory → getInventory with correct method and URL', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const req = col.requests.find((r) => r.name === 'getInventory')
    expect(req).toBeDefined()
    expect(req!.method).toBe('GET')
    expect(req!.url).toBe('https://api.petstore.example.com/v3/store/inventory')
  })

  it('maps POST /store/orders → placeOrder with correct method and URL', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const req = col.requests.find((r) => r.name === 'placeOrder')
    expect(req).toBeDefined()
    expect(req!.method).toBe('POST')
    expect(req!.url).toBe('https://api.petstore.example.com/v3/store/orders')
  })

  // --- Request structural correctness ---

  it('assigns non-empty UUIDs to all requests', () => {
    const col = importOpenApi(openApiFixtureYaml)
    for (const req of col.requests) {
      expect(typeof req.id).toBe('string')
      expect(req.id).toMatch(/^[0-9a-f-]{36}$/)
    }
  })

  it('assigns unique UUIDs across all requests', () => {
    const col = importOpenApi(openApiFixtureYaml)
    const ids = col.requests.map((r) => r.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('initialises each request with empty headers and no-auth', () => {
    const col = importOpenApi(openApiFixtureYaml)
    for (const req of col.requests) {
      expect(req.headers).toEqual([])
      expect(req.auth).toEqual({ type: 'none' })
    }
  })

  it('initialises each request with an empty JSON body', () => {
    const col = importOpenApi(openApiFixtureYaml)
    for (const req of col.requests) {
      expect(req.body).toEqual({ type: 'json', content: '' })
    }
  })
})
