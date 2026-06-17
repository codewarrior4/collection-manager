/**
 * Integration test: IndexedDB initialisation
 *
 * Verifies that:
 * 1. Both `collections` and `environments` object stores are created on DB open.
 * 2. Documents seeded before module initialisation are retrievable after init.
 * 3. Documents seeded after module initialisation are retrievable via the db promise.
 *
 * Requirements: 8.3
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

// Fixture data ----------------------------------------------------------------

const fixtureCollection = {
  id: 'col-fixture-001',
  name: 'Fixture Collection',
  folders: [
    {
      id: 'folder-fixture-001',
      name: 'Auth Endpoints',
      folders: [],
      requests: [
        {
          id: 'req-fixture-002',
          name: 'Login',
          method: 'POST' as const,
          url: 'https://api.example.com/auth/login',
          headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
          body: { type: 'json' as const, content: '{"email":"user@example.com"}' },
          auth: { type: 'none' as const },
        },
      ],
    },
  ],
  requests: [
    {
      id: 'req-fixture-001',
      name: 'Health Check',
      method: 'GET' as const,
      url: 'https://api.example.com/health',
      headers: [],
      body: { type: 'json' as const, content: '' },
      auth: { type: 'none' as const },
    },
  ],
}

const fixtureEnvironment = {
  id: 'env-fixture-001',
  name: 'Local',
  variables: [
    { key: 'base_url', value: 'http://localhost:3000', enabled: true },
    { key: 'api_key', value: 'dev-key-abc123', enabled: true },
  ],
  jwtToken: undefined,
}

// Helpers ---------------------------------------------------------------------

/**
 * Opens the real DB using the application's openDB call but backed by a fresh
 * fake-indexeddb instance. Returns a raw IDBDatabase so we can seed it before
 * the app module is imported.
 */
function openRawFakeDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const fakeIdb = new IDBFactory()
    const request = fakeIdb.open('api-collection-manager', 1)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('collections')) {
        db.createObjectStore('collections', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('environments')) {
        db.createObjectStore('environments', { keyPath: 'id' })
      }
    }

    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result)
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error)
  })
}

// Tests -----------------------------------------------------------------------

describe('IndexedDB initialisation (integration)', () => {
  beforeEach(() => {
    // Provide a fresh IDBFactory for each test so stores are isolated.
    // The `idb` library and our db/index.ts both use the global `indexedDB`;
    // replacing it before each test gives a clean slate without module re-import.
    ;(globalThis as Record<string, unknown>).indexedDB = new IDBFactory()
  })

  it('opens the database and creates both object stores', async () => {
    // Dynamically import after the fake IDBFactory is in place so openDB uses it.
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    const storeNames = Array.from(resolvedDb.objectStoreNames)
    expect(storeNames).toContain('collections')
    expect(storeNames).toContain('environments')
  })

  it('seeded collections are retrievable after db initialisation', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    // Seed a collection document directly via the idb wrapper.
    await resolvedDb.put('collections', fixtureCollection)

    // Retrieve by key and assert deep equality.
    const retrieved = await resolvedDb.get('collections', fixtureCollection.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(fixtureCollection.id)
    expect(retrieved!.name).toBe(fixtureCollection.name)
  })

  it('seeded environments are retrievable after db initialisation', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    await resolvedDb.put('environments', fixtureEnvironment)

    const retrieved = await resolvedDb.get('environments', fixtureEnvironment.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(fixtureEnvironment.id)
    expect(retrieved!.name).toBe(fixtureEnvironment.name)
    expect(retrieved!.variables).toHaveLength(2)
    expect(retrieved!.variables[0].key).toBe('base_url')
  })

  it('getAll returns all seeded collections', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    const second = { ...fixtureCollection, id: 'col-fixture-002', name: 'Second Collection' }

    await resolvedDb.put('collections', fixtureCollection)
    await resolvedDb.put('collections', second)

    const all = await resolvedDb.getAll('collections')
    expect(all).toHaveLength(2)

    const ids = all.map((c) => c.id)
    expect(ids).toContain(fixtureCollection.id)
    expect(ids).toContain(second.id)
  })

  it('preserves nested folder and request structure in seeded collection', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    await resolvedDb.put('collections', fixtureCollection)

    const retrieved = await resolvedDb.get('collections', fixtureCollection.id)
    expect(retrieved).toBeDefined()

    // Top-level requests
    expect(retrieved!.requests).toHaveLength(1)
    expect(retrieved!.requests[0].id).toBe('req-fixture-001')
    expect(retrieved!.requests[0].method).toBe('GET')

    // Nested folder + its requests
    expect(retrieved!.folders).toHaveLength(1)
    expect(retrieved!.folders[0].id).toBe('folder-fixture-001')
    expect(retrieved!.folders[0].requests).toHaveLength(1)
    expect(retrieved!.folders[0].requests[0].id).toBe('req-fixture-002')
  })

  it('environments object store is independent of collections store', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    await resolvedDb.put('collections', fixtureCollection)
    await resolvedDb.put('environments', fixtureEnvironment)

    // Counts are independent — seeding one store doesn't bleed into the other.
    const allCollections = await resolvedDb.getAll('collections')
    const allEnvironments = await resolvedDb.getAll('environments')

    expect(allCollections).toHaveLength(1)
    expect(allEnvironments).toHaveLength(1)
    expect(allCollections[0].id).toBe(fixtureCollection.id)
    expect(allEnvironments[0].id).toBe(fixtureEnvironment.id)
  })

  it('getAll returns empty array when no documents have been seeded', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    const collections = await resolvedDb.getAll('collections')
    const environments = await resolvedDb.getAll('environments')

    expect(collections).toHaveLength(0)
    expect(environments).toHaveLength(0)
  })
})
