/**
 * Integration tests: IndexedDB initialisation and schema migration
 *
 * Verifies that:
 * 1. Both `collections` and `environments` object stores are created on DB open.
 * 2. Documents seeded after module initialisation are retrievable via the db promise.
 * 3. The stores hold independent document sets.
 * 4. When a v2 upgrade callback is applied to a v1 database, all v1 documents
 *    are preserved unchanged (Requirements: 8.5).
 *
 * `fake-indexeddb/auto` is imported first so all IDB globals (`indexedDB`,
 * `IDBRequest`, `IDBFactory`, etc.) are available in the jsdom environment
 * before `src/db/index.ts` calls `openDB`.
 *
 * Requirements: 8.3, 8.5
 */

// Must be the first import — installs IDB globals into the jsdom environment.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { applyMigrations } from '@/db/migrations'

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Helper: open a fresh in-memory DB using the same schema as src/db/index.ts
// ---------------------------------------------------------------------------

async function openFreshDB() {
  // Each call gets a unique name so tests are fully isolated.
  const dbName = `api-collection-manager-test-${Math.random().toString(36).slice(2)}`
  return openDB(dbName, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('collections')) {
        database.createObjectStore('collections', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('environments')) {
        database.createObjectStore('environments', { keyPath: 'id' })
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IndexedDB initialisation (integration)', () => {
  /**
   * Replace the global IDBFactory before each test so that the module-level
   * `db` promise in src/db/index.ts gets a fresh in-memory database when
   * the module is (re-)imported.
   */
  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).indexedDB = new IDBFactory()
    vi.resetModules()
  })

  it('creates both object stores when the DB is opened', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    const storeNames = Array.from(resolvedDb.objectStoreNames)
    expect(storeNames).toContain('collections')
    expect(storeNames).toContain('environments')
  })

  it('seeded collection document is retrievable by id', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    await resolvedDb.put('collections', fixtureCollection)

    const retrieved = await resolvedDb.get('collections', fixtureCollection.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(fixtureCollection.id)
    expect(retrieved!.name).toBe(fixtureCollection.name)
  })

  it('seeded environment document is retrievable by id', async () => {
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

  it('getAll returns every seeded collection', async () => {
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

  it('preserves nested folder and request structure in a seeded collection', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    await resolvedDb.put('collections', fixtureCollection)

    const retrieved = await resolvedDb.get('collections', fixtureCollection.id)
    expect(retrieved).toBeDefined()

    // Top-level request
    expect(retrieved!.requests).toHaveLength(1)
    expect(retrieved!.requests[0].id).toBe('req-fixture-001')
    expect(retrieved!.requests[0].method).toBe('GET')

    // Nested folder with its own request
    expect(retrieved!.folders).toHaveLength(1)
    expect(retrieved!.folders[0].id).toBe('folder-fixture-001')
    expect(retrieved!.folders[0].requests).toHaveLength(1)
    expect(retrieved!.folders[0].requests[0].id).toBe('req-fixture-002')
  })

  it('collections and environments stores are independent', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    await resolvedDb.put('collections', fixtureCollection)
    await resolvedDb.put('environments', fixtureEnvironment)

    const allCollections = await resolvedDb.getAll('collections')
    const allEnvironments = await resolvedDb.getAll('environments')

    expect(allCollections).toHaveLength(1)
    expect(allEnvironments).toHaveLength(1)
    expect(allCollections[0].id).toBe(fixtureCollection.id)
    expect(allEnvironments[0].id).toBe(fixtureEnvironment.id)
  })

  it('getAll returns an empty array when no documents have been seeded', async () => {
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    const collections = await resolvedDb.getAll('collections')
    const environments = await resolvedDb.getAll('environments')

    expect(collections).toHaveLength(0)
    expect(environments).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Direct openDB tests — validate schema independently of the app module
  // -------------------------------------------------------------------------

  it('openFreshDB helper creates the same schema as the app db module', async () => {
    const freshDb = await openFreshDB()

    const storeNames = Array.from(freshDb.objectStoreNames)
    expect(storeNames).toContain('collections')
    expect(storeNames).toContain('environments')

    freshDb.close()
  })

  it('documents seeded before module import are retrievable after import', async () => {
    // Seed directly into the global fake IDB (same IDBFactory the module will use)
    const seedDb = await openDB('api-collection-manager', 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('collections')) {
          database.createObjectStore('collections', { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains('environments')) {
          database.createObjectStore('environments', { keyPath: 'id' })
        }
      },
    })
    await seedDb.put('collections', fixtureCollection)
    await seedDb.put('environments', fixtureEnvironment)
    seedDb.close()

    // Now import the app module — it will open the same (already-seeded) DB.
    const { db } = await import('@/db/index')
    const resolvedDb = await db

    const col = await resolvedDb.get('collections', fixtureCollection.id)
    const env = await resolvedDb.get('environments', fixtureEnvironment.id)

    expect(col).toBeDefined()
    expect(col!.name).toBe(fixtureCollection.name)
    expect(env).toBeDefined()
    expect(env!.name).toBe(fixtureEnvironment.name)
  })
})

// ---------------------------------------------------------------------------
// Schema migration integration tests (Requirement 8.5)
// ---------------------------------------------------------------------------

/**
 * Helper: open a v1 database and seed it with the supplied documents.
 * The returned db handle is closed so the same name can be re-opened at v2.
 */
async function seedV1Database(
  dbName: string,
  collections: typeof fixtureCollection[],
  environments: typeof fixtureEnvironment[],
) {
  const v1db = await openDB(dbName, 1, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        if (!database.objectStoreNames.contains('collections')) {
          database.createObjectStore('collections', { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains('environments')) {
          database.createObjectStore('environments', { keyPath: 'id' })
        }
      }
    },
  })

  for (const col of collections) {
    await v1db.put('collections', col)
  }
  for (const env of environments) {
    await v1db.put('environments', env)
  }

  v1db.close()
}

describe('IndexedDB schema migration (integration)', () => {
  // Give each test its own isolated in-memory database name.
  let dbName: string

  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).indexedDB = new IDBFactory()
    dbName = `migration-test-${Math.random().toString(36).slice(2)}`
  })

  it('v1 collection documents are preserved after v2 upgrade callback runs', async () => {
    // 1. Seed v1 data.
    await seedV1Database(dbName, [fixtureCollection], [])

    // 2. Open at v2 — idb calls the upgrade callback with oldVersion=1, newVersion=2.
    //    applyMigrations is a no-op for oldVersion < 2 today, mirroring production behaviour
    //    (v2 adds no new schema changes, only preserves data).
    const v2db = await openDB(dbName, 2, {
      upgrade(database, oldVersion, newVersion) {
        applyMigrations(database as Parameters<typeof applyMigrations>[0], oldVersion, newVersion)
      },
    })

    // 3. Assert the v1 collection is fully intact.
    const retrieved = await v2db.get('collections', fixtureCollection.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(fixtureCollection.id)
    expect(retrieved!.name).toBe(fixtureCollection.name)

    // Nested structure must survive the migration unchanged.
    expect(retrieved!.requests).toHaveLength(1)
    expect(retrieved!.requests[0].id).toBe('req-fixture-001')
    expect(retrieved!.requests[0].method).toBe('GET')
    expect(retrieved!.folders).toHaveLength(1)
    expect(retrieved!.folders[0].id).toBe('folder-fixture-001')
    expect(retrieved!.folders[0].requests[0].id).toBe('req-fixture-002')

    v2db.close()
  })

  it('v1 environment documents are preserved after v2 upgrade callback runs', async () => {
    // 1. Seed v1 data.
    await seedV1Database(dbName, [], [fixtureEnvironment])

    // 2. Open at v2.
    const v2db = await openDB(dbName, 2, {
      upgrade(database, oldVersion, newVersion) {
        applyMigrations(database as Parameters<typeof applyMigrations>[0], oldVersion, newVersion)
      },
    })

    // 3. Assert the v1 environment is fully intact.
    const retrieved = await v2db.get('environments', fixtureEnvironment.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(fixtureEnvironment.id)
    expect(retrieved!.name).toBe(fixtureEnvironment.name)
    expect(retrieved!.variables).toHaveLength(2)
    expect(retrieved!.variables[0]).toEqual({ key: 'base_url', value: 'http://localhost:3000', enabled: true })
    expect(retrieved!.variables[1]).toEqual({ key: 'api_key', value: 'dev-key-abc123', enabled: true })

    v2db.close()
  })

  it('multiple v1 collections are all preserved after v2 upgrade', async () => {
    const secondCollection = {
      ...fixtureCollection,
      id: 'col-migration-002',
      name: 'Second Collection',
      folders: [],
      requests: [],
    }

    // 1. Seed two collections in v1.
    await seedV1Database(dbName, [fixtureCollection, secondCollection], [])

    // 2. Open at v2.
    const v2db = await openDB(dbName, 2, {
      upgrade(database, oldVersion, newVersion) {
        applyMigrations(database as Parameters<typeof applyMigrations>[0], oldVersion, newVersion)
      },
    })

    // 3. Both documents must still be present.
    const all = await v2db.getAll('collections')
    expect(all).toHaveLength(2)

    const ids = all.map((c) => c.id)
    expect(ids).toContain(fixtureCollection.id)
    expect(ids).toContain(secondCollection.id)

    v2db.close()
  })

  it('v1 data in both stores is preserved simultaneously after v2 upgrade', async () => {
    // 1. Seed both stores in v1.
    await seedV1Database(dbName, [fixtureCollection], [fixtureEnvironment])

    // 2. Open at v2.
    const v2db = await openDB(dbName, 2, {
      upgrade(database, oldVersion, newVersion) {
        applyMigrations(database as Parameters<typeof applyMigrations>[0], oldVersion, newVersion)
      },
    })

    // 3. Both stores retain all documents unchanged.
    const allCollections = await v2db.getAll('collections')
    const allEnvironments = await v2db.getAll('environments')

    expect(allCollections).toHaveLength(1)
    expect(allCollections[0].id).toBe(fixtureCollection.id)

    expect(allEnvironments).toHaveLength(1)
    expect(allEnvironments[0].id).toBe(fixtureEnvironment.id)

    v2db.close()
  })

  it('v1 collection field values are deeply equal after v2 upgrade (no field mutation)', async () => {
    // 1. Seed v1 data.
    await seedV1Database(dbName, [fixtureCollection], [])

    // 2. Open at v2.
    const v2db = await openDB(dbName, 2, {
      upgrade(database, oldVersion, newVersion) {
        applyMigrations(database as Parameters<typeof applyMigrations>[0], oldVersion, newVersion)
      },
    })

    // 3. Deep equality — every field must match the original fixture exactly.
    const retrieved = await v2db.get('collections', fixtureCollection.id)
    expect(retrieved).toEqual(fixtureCollection)

    v2db.close()
  })
})
