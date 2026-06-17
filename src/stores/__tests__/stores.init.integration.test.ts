/**
 * Integration test: store initialisation from IndexedDB
 *
 * Verifies that `collectionsStore.init()` and `environmentsStore.init()` each
 * populate Pinia state from real IndexedDB data before any component mounts —
 * confirming that the in-memory working state faithfully reflects what is
 * persisted in Storage at startup.
 *
 * This test does NOT mock `@/db`. It seeds a real (in-memory) IndexedDB
 * instance via `fake-indexeddb` and then imports the stores fresh after the
 * module registry is reset, so the `db` promise resolves against the seeded
 * database — exactly as it would in the running application.
 *
 * Requirements: 8.3
 */

// Must be the very first import — installs IDB globals into the jsdom environment
// before any `openDB` call runs.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import type { Collection, Environment } from '@/types'

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const fixtureCollection: Collection = {
  id: 'init-col-001',
  name: 'Pet Store API',
  folders: [
    {
      id: 'init-folder-001',
      name: 'Pets',
      folders: [
        {
          id: 'init-subfolder-001',
          name: 'Rare Breeds',
          folders: [],
          requests: [
            {
              id: 'init-req-003',
              name: 'Get Rare Breed',
              method: 'GET',
              url: 'https://api.example.com/pets/rare/{{breedId}}',
              headers: [],
              body: { type: 'json', content: '' },
              auth: { type: 'none' },
            },
          ],
        },
      ],
      requests: [
        {
          id: 'init-req-002',
          name: 'List Pets',
          method: 'GET',
          url: 'https://api.example.com/pets',
          headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
          body: { type: 'json', content: '' },
          auth: { type: 'none' },
        },
      ],
    },
  ],
  requests: [
    {
      id: 'init-req-001',
      name: 'Health Check',
      method: 'GET',
      url: 'https://api.example.com/health',
      headers: [],
      body: { type: 'json', content: '' },
      auth: { type: 'none' },
    },
  ],
}

const fixtureCollection2: Collection = {
  id: 'init-col-002',
  name: 'User Service',
  folders: [],
  requests: [
    {
      id: 'init-req-004',
      name: 'Get User',
      method: 'GET',
      url: 'https://users.example.com/{{userId}}',
      headers: [
        { key: 'Authorization', value: 'Bearer {{token}}', enabled: true },
        { key: 'Content-Type', value: 'application/json', enabled: true },
      ],
      body: { type: 'json', content: '' },
      auth: { type: 'bearer', token: '' },
    },
    {
      id: 'init-req-005',
      name: 'Create User',
      method: 'POST',
      url: 'https://users.example.com/',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: { type: 'json', content: '{"name":"Alice","email":"alice@example.com"}' },
      auth: { type: 'none' },
    },
  ],
}

const fixtureEnvironment: Environment = {
  id: 'init-env-001',
  name: 'Local',
  variables: [
    { key: 'base_url', value: 'http://localhost:3000', enabled: true },
    { key: 'api_key', value: 'dev-key-abc123', enabled: true },
    { key: 'disabled_var', value: 'should-not-resolve', enabled: false },
  ],
  jwtToken: 'header.payload.signature',
}

const fixtureEnvironment2: Environment = {
  id: 'init-env-002',
  name: 'Staging',
  variables: [
    { key: 'base_url', value: 'https://staging.example.com', enabled: true },
    { key: 'api_key', value: 'staging-key-xyz', enabled: true },
  ],
}

// ---------------------------------------------------------------------------
// Helper: seed the current global IDBFactory with fixture data using the
// same schema as `src/db/index.ts`.
// ---------------------------------------------------------------------------

async function seedDatabase(
  collections: Collection[],
  environments: Environment[],
): Promise<void> {
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

  for (const col of collections) {
    await seedDb.put('collections', col)
  }
  for (const env of environments) {
    await seedDb.put('environments', env)
  }

  // Close so the app module can open the same database handle without conflict.
  seedDb.close()
}

// ---------------------------------------------------------------------------
// Setup: fresh IDBFactory + fresh module registry before every test.
//
// Replacing `globalThis.indexedDB` with a new IDBFactory gives each test an
// isolated in-memory database. `vi.resetModules()` ensures the `db` promise
// in `src/db/index.ts` is re-created against the new IDBFactory rather than
// reusing the cached handle from a previous test.
// ---------------------------------------------------------------------------

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).indexedDB = new IDBFactory()
  // vi is available as a global because vitest globals are enabled in vite.config.ts
  vi.resetModules()
  setActivePinia(createPinia())
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Store initialisation from IndexedDB (integration)', () => {
  it('collectionsStore.init() loads all seeded collections into Pinia state', async () => {
    await seedDatabase([fixtureCollection, fixtureCollection2], [])

    // Import after reset so `db` resolves against the freshly seeded IDB.
    const { useCollectionsStore } = await import('@/stores/collections')
    const store = useCollectionsStore()

    expect(store.collections).toHaveLength(0) // empty before init

    await store.init()

    expect(store.collections).toHaveLength(2)
    const ids = store.collections.map((c) => c.id)
    expect(ids).toContain(fixtureCollection.id)
    expect(ids).toContain(fixtureCollection2.id)
  })

  it('collectionsStore.init() preserves collection names', async () => {
    await seedDatabase([fixtureCollection, fixtureCollection2], [])

    const { useCollectionsStore } = await import('@/stores/collections')
    const store = useCollectionsStore()
    await store.init()

    const names = store.collections.map((c) => c.name)
    expect(names).toContain('Pet Store API')
    expect(names).toContain('User Service')
  })

  it('collectionsStore.init() preserves top-level requests', async () => {
    await seedDatabase([fixtureCollection], [])

    const { useCollectionsStore } = await import('@/stores/collections')
    const store = useCollectionsStore()
    await store.init()

    const col = store.collections.find((c) => c.id === fixtureCollection.id)!
    expect(col).toBeDefined()
    expect(col.requests).toHaveLength(1)
    expect(col.requests[0].id).toBe('init-req-001')
    expect(col.requests[0].method).toBe('GET')
    expect(col.requests[0].url).toBe('https://api.example.com/health')
  })

  it('collectionsStore.init() preserves nested folders and their requests', async () => {
    await seedDatabase([fixtureCollection], [])

    const { useCollectionsStore } = await import('@/stores/collections')
    const store = useCollectionsStore()
    await store.init()

    const col = store.collections.find((c) => c.id === fixtureCollection.id)!
    expect(col.folders).toHaveLength(1)

    const petsFolder = col.folders[0]
    expect(petsFolder.id).toBe('init-folder-001')
    expect(petsFolder.name).toBe('Pets')
    expect(petsFolder.requests).toHaveLength(1)
    expect(petsFolder.requests[0].id).toBe('init-req-002')
    expect(petsFolder.requests[0].headers[0].key).toBe('Accept')
  })

  it('collectionsStore.init() preserves deeply nested sub-folders', async () => {
    await seedDatabase([fixtureCollection], [])

    const { useCollectionsStore } = await import('@/stores/collections')
    const store = useCollectionsStore()
    await store.init()

    const col = store.collections.find((c) => c.id === fixtureCollection.id)!
    const subFolder = col.folders[0].folders[0]
    expect(subFolder).toBeDefined()
    expect(subFolder.id).toBe('init-subfolder-001')
    expect(subFolder.name).toBe('Rare Breeds')
    expect(subFolder.requests).toHaveLength(1)
    expect(subFolder.requests[0].id).toBe('init-req-003')
  })

  it('collectionsStore.init() produces state deeply equal to seeded fixtures', async () => {
    await seedDatabase([fixtureCollection], [])

    const { useCollectionsStore } = await import('@/stores/collections')
    const store = useCollectionsStore()
    await store.init()

    const col = store.collections.find((c) => c.id === fixtureCollection.id)!
    expect(col).toEqual(fixtureCollection)
  })

  it('collectionsStore.init() results in an empty array when the DB is empty', async () => {
    // No seeding — empty database
    const { useCollectionsStore } = await import('@/stores/collections')
    const store = useCollectionsStore()
    await store.init()

    expect(store.collections).toHaveLength(0)
  })

  it('environmentsStore.init() loads all seeded environments into Pinia state', async () => {
    await seedDatabase([], [fixtureEnvironment, fixtureEnvironment2])

    const { useEnvironmentsStore } = await import('@/stores/environments')
    const store = useEnvironmentsStore()

    expect(store.environments).toHaveLength(0) // empty before init

    await store.init()

    expect(store.environments).toHaveLength(2)
    const ids = store.environments.map((e) => e.id)
    expect(ids).toContain(fixtureEnvironment.id)
    expect(ids).toContain(fixtureEnvironment2.id)
  })

  it('environmentsStore.init() preserves environment names', async () => {
    await seedDatabase([], [fixtureEnvironment, fixtureEnvironment2])

    const { useEnvironmentsStore } = await import('@/stores/environments')
    const store = useEnvironmentsStore()
    await store.init()

    const names = store.environments.map((e) => e.name)
    expect(names).toContain('Local')
    expect(names).toContain('Staging')
  })

  it('environmentsStore.init() preserves variables including enabled/disabled state', async () => {
    await seedDatabase([], [fixtureEnvironment])

    const { useEnvironmentsStore } = await import('@/stores/environments')
    const store = useEnvironmentsStore()
    await store.init()

    const env = store.environments.find((e) => e.id === fixtureEnvironment.id)!
    expect(env).toBeDefined()
    expect(env.variables).toHaveLength(3)

    const baseUrl = env.variables.find((v) => v.key === 'base_url')!
    expect(baseUrl.value).toBe('http://localhost:3000')
    expect(baseUrl.enabled).toBe(true)

    const disabled = env.variables.find((v) => v.key === 'disabled_var')!
    expect(disabled.enabled).toBe(false)
  })

  it('environmentsStore.init() preserves jwtToken on environments that have one', async () => {
    await seedDatabase([], [fixtureEnvironment])

    const { useEnvironmentsStore } = await import('@/stores/environments')
    const store = useEnvironmentsStore()
    await store.init()

    const env = store.environments.find((e) => e.id === fixtureEnvironment.id)!
    expect(env.jwtToken).toBe('header.payload.signature')
  })

  it('environmentsStore.init() leaves jwtToken undefined for envs without one', async () => {
    await seedDatabase([], [fixtureEnvironment2])

    const { useEnvironmentsStore } = await import('@/stores/environments')
    const store = useEnvironmentsStore()
    await store.init()

    const env = store.environments.find((e) => e.id === fixtureEnvironment2.id)!
    expect(env.jwtToken).toBeUndefined()
  })

  it('environmentsStore.init() produces state deeply equal to seeded fixtures', async () => {
    await seedDatabase([], [fixtureEnvironment])

    const { useEnvironmentsStore } = await import('@/stores/environments')
    const store = useEnvironmentsStore()
    await store.init()

    const env = store.environments.find((e) => e.id === fixtureEnvironment.id)!
    expect(env).toEqual(fixtureEnvironment)
  })

  it('environmentsStore.init() results in an empty array when the DB is empty', async () => {
    const { useEnvironmentsStore } = await import('@/stores/environments')
    const store = useEnvironmentsStore()
    await store.init()

    expect(store.environments).toHaveLength(0)
  })

  it('both stores initialise correctly from the same seeded database', async () => {
    await seedDatabase([fixtureCollection, fixtureCollection2], [fixtureEnvironment, fixtureEnvironment2])

    // Import both stores — they share the same db promise from `@/db/index.ts`
    const { useCollectionsStore } = await import('@/stores/collections')
    const { useEnvironmentsStore } = await import('@/stores/environments')

    const collectionsStore = useCollectionsStore()
    const environmentsStore = useEnvironmentsStore()

    await collectionsStore.init()
    await environmentsStore.init()

    // Collections state matches
    expect(collectionsStore.collections).toHaveLength(2)
    expect(collectionsStore.collections.map((c) => c.id)).toContain(fixtureCollection.id)
    expect(collectionsStore.collections.map((c) => c.id)).toContain(fixtureCollection2.id)

    // Environments state matches
    expect(environmentsStore.environments).toHaveLength(2)
    expect(environmentsStore.environments.map((e) => e.id)).toContain(fixtureEnvironment.id)
    expect(environmentsStore.environments.map((e) => e.id)).toContain(fixtureEnvironment2.id)

    // The two stores are independent — collections are not polluted with environments
    const colIds = collectionsStore.collections.map((c) => c.id)
    expect(colIds).not.toContain(fixtureEnvironment.id)
    expect(colIds).not.toContain(fixtureEnvironment2.id)
  })

  it('activeId remains null after init (no environment is auto-selected)', async () => {
    await seedDatabase([], [fixtureEnvironment, fixtureEnvironment2])

    const { useEnvironmentsStore } = await import('@/stores/environments')
    const store = useEnvironmentsStore()
    await store.init()

    expect(store.activeId).toBeNull()
    expect(store.activeEnvironment).toBeNull()
  })

  it('calling init() a second time replaces state with the current DB contents', async () => {
    await seedDatabase([fixtureCollection], [])

    const { useCollectionsStore } = await import('@/stores/collections')
    const store = useCollectionsStore()
    await store.init()
    expect(store.collections).toHaveLength(1)

    // Write a second collection directly to the DB, then call init() again
    const { db } = await import('@/db')
    const resolvedDb = await db
    await resolvedDb.put('collections', fixtureCollection2)

    await store.init()

    expect(store.collections).toHaveLength(2)
  })

  it('Pinia state matches seeded data before any component mounts (no side-effects)', async () => {
    // This is the canonical requirement 8.3 assertion: init resolves with
    // the correct data using only store + idb, with no Vue component in play.
    await seedDatabase([fixtureCollection], [fixtureEnvironment])

    const { useCollectionsStore } = await import('@/stores/collections')
    const { useEnvironmentsStore } = await import('@/stores/environments')

    const collectionsStore = useCollectionsStore()
    const environmentsStore = useEnvironmentsStore()

    // Stores must be empty before init is called
    expect(collectionsStore.collections).toHaveLength(0)
    expect(environmentsStore.environments).toHaveLength(0)

    await Promise.all([collectionsStore.init(), environmentsStore.init()])

    // After init, state must exactly match what was seeded
    expect(collectionsStore.collections).toHaveLength(1)
    expect(collectionsStore.collections[0]).toEqual(fixtureCollection)

    expect(environmentsStore.environments).toHaveLength(1)
    expect(environmentsStore.environments[0]).toEqual(fixtureEnvironment)
  })
})
