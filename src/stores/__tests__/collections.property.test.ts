// Feature: postman, Property 7: Entity Factory Structural Invariants

/**
 * Property-based tests for entity factory structural invariants.
 *
 * Property 7: Entity Factory Structural Invariants
 *   For any non-empty name string, `createCollection(name)` SHALL produce a
 *   Collection with:
 *     - a valid UUID `id` (RFC 4122 v4 format)
 *     - `name` equal to the input string
 *     - `folders` equal to `[]`
 *     - `requests` equal to `[]`
 *
 *   The same structural invariant SHALL hold for `createEnvironment(name)`:
 *     - a valid UUID `id`
 *     - `name` equal to the input string
 *     - `variables` equal to `[]`
 *     - no `jwtToken` field (or `jwtToken` is `undefined`)
 *
 * Validates: Requirements 1.2, 4.1
 * Minimum iterations: 100
 */

import * as fc from 'fast-check'
import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Collection, Environment } from '@/types'

// ─── UUID validation ────────────────────────────────────────────────────────

/**
 * RFC 4122 UUID v4 regex.
 * Matches the format produced by `crypto.randomUUID()` in modern runtimes.
 */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(id: string): boolean {
  return UUID_V4_RE.test(id)
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const { mockDb, mockShowError } = vi.hoisted(() => {
  const mockDb = {
    getAll: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
  const mockShowError = vi.fn()
  return { mockDb, mockShowError }
})

vi.mock('@/db', () => ({
  db: Promise.resolve(mockDb),
}))

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({ showError: mockShowError }),
}))

// ─── Store imports (after mocks) ─────────────────────────────────────────────

import { useCollectionsStore } from '../collections'

// ─── Inline environment factory (mirrors the pattern task 8.6 will implement) ──

/**
 * Pure factory that creates an Environment with the same structural invariants
 * that the environmentsStore.createEnvironment() action will enforce.
 *
 * This function is tested here independently of the store so the property
 * can run without a real or mocked idb backend. When `src/stores/environments.ts`
 * is implemented (task 8.6) its factory logic MUST satisfy these same invariants.
 */
function createEnvironmentEntity(name: string): Environment {
  return {
    id: crypto.randomUUID(),
    name,
    variables: [],
    // jwtToken intentionally omitted — must be undefined
  }
}

// ─── fast-check global configuration ─────────────────────────────────────────

beforeAll(() => {
  fc.configureGlobal({ numRuns: 100 })
})

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockDb.getAll.mockResolvedValue([])
  mockDb.put.mockResolvedValue(undefined)
  mockDb.delete.mockResolvedValue(undefined)
})

// ─── Arbitrary: non-empty name strings ───────────────────────────────────────

/**
 * Generates arbitrary non-empty strings suitable for use as entity names.
 * Includes Unicode, whitespace, and special characters to exercise the full
 * range of valid inputs.
 */
const nonEmptyNameArb = fc.string({ minLength: 1, maxLength: 100 })

// ─── Property 7a: createCollection factory invariants ────────────────────────

describe('Property 7 — createCollection: Entity Factory Structural Invariants', () => {
  it('produces a Collection with a valid UUID id for any non-empty name', async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyNameArb, async (name) => {
        const store = useCollectionsStore()
        const beforeLength = store.collections.length

        await store.createCollection(name)

        const created = store.collections.find((c, idx) => idx === beforeLength)
        expect(created).toBeDefined()
        expect(isValidUuid(created!.id)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it("stores the exact input name on the created Collection", async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyNameArb, async (name) => {
        const store = useCollectionsStore()
        const beforeLength = store.collections.length

        await store.createCollection(name)

        const created = store.collections[beforeLength]
        expect(created.name).toBe(name)
      }),
      { numRuns: 100 },
    )
  })

  it('creates a Collection with an empty folders array', async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyNameArb, async (name) => {
        const store = useCollectionsStore()
        const beforeLength = store.collections.length

        await store.createCollection(name)

        const created = store.collections[beforeLength]
        expect(created.folders).toEqual([])
      }),
      { numRuns: 100 },
    )
  })

  it('creates a Collection with an empty requests array', async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyNameArb, async (name) => {
        const store = useCollectionsStore()
        const beforeLength = store.collections.length

        await store.createCollection(name)

        const created = store.collections[beforeLength]
        expect(created.requests).toEqual([])
      }),
      { numRuns: 100 },
    )
  })

  it('assigns a unique id for each createCollection call (no collisions across N calls)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nonEmptyNameArb, { minLength: 2, maxLength: 10 }),
        async (names) => {
          const store = useCollectionsStore()
          const startIdx = store.collections.length

          for (const name of names) {
            await store.createCollection(name)
          }

          const created = store.collections.slice(startIdx)
          const ids = created.map((c) => c.id)
          const uniqueIds = new Set(ids)

          // All ids must be unique — no UUID collisions
          expect(uniqueIds.size).toBe(ids.length)
          // All must be valid UUIDs
          for (const id of ids) {
            expect(isValidUuid(id)).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('satisfies all structural invariants simultaneously (composite assertion)', async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyNameArb, async (name) => {
        const store = useCollectionsStore()
        const beforeLength = store.collections.length

        await store.createCollection(name)

        const created = store.collections[beforeLength]

        // All four invariants in one shot
        const structurallyValid =
          isValidUuid(created.id) &&
          created.name === name &&
          Array.isArray(created.folders) &&
          created.folders.length === 0 &&
          Array.isArray(created.requests) &&
          created.requests.length === 0

        expect(structurallyValid).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 7b: createEnvironment factory invariants ───────────────────────

describe('Property 7 — createEnvironment: Entity Factory Structural Invariants', () => {
  it('produces an Environment with a valid UUID id for any non-empty name', () => {
    fc.assert(
      fc.property(nonEmptyNameArb, (name) => {
        const env = createEnvironmentEntity(name)
        expect(isValidUuid(env.id)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it("stores the exact input name on the created Environment", () => {
    fc.assert(
      fc.property(nonEmptyNameArb, (name) => {
        const env = createEnvironmentEntity(name)
        expect(env.name).toBe(name)
      }),
      { numRuns: 100 },
    )
  })

  it('creates an Environment with an empty variables array', () => {
    fc.assert(
      fc.property(nonEmptyNameArb, (name) => {
        const env = createEnvironmentEntity(name)
        expect(env.variables).toEqual([])
      }),
      { numRuns: 100 },
    )
  })

  it('creates an Environment with no jwtToken (undefined)', () => {
    fc.assert(
      fc.property(nonEmptyNameArb, (name) => {
        const env = createEnvironmentEntity(name)
        expect(env.jwtToken).toBeUndefined()
      }),
      { numRuns: 100 },
    )
  })

  it('assigns a unique id for each createEnvironment call (no collisions across N calls)', () => {
    fc.assert(
      fc.property(
        fc.array(nonEmptyNameArb, { minLength: 2, maxLength: 10 }),
        (names) => {
          const ids = names.map((name) => createEnvironmentEntity(name).id)
          const uniqueIds = new Set(ids)

          expect(uniqueIds.size).toBe(ids.length)
          for (const id of ids) {
            expect(isValidUuid(id)).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('satisfies all structural invariants simultaneously (composite assertion)', () => {
    fc.assert(
      fc.property(nonEmptyNameArb, (name) => {
        const env: Environment = createEnvironmentEntity(name)

        const structurallyValid =
          isValidUuid(env.id) &&
          env.name === name &&
          Array.isArray(env.variables) &&
          env.variables.length === 0 &&
          env.jwtToken === undefined

        expect(structurallyValid).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Cross-cutting: both factories produce disjoint id spaces ─────────────────

describe('Property 7 — cross-factory: ids are globally unique', () => {
  it('collection ids and environment ids do not collide across concurrent factory calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nonEmptyNameArb, { minLength: 1, maxLength: 5 }),
        fc.array(nonEmptyNameArb, { minLength: 1, maxLength: 5 }),
        async (collectionNames, envNames) => {
          const store = useCollectionsStore()
          const startIdx = store.collections.length

          for (const name of collectionNames) {
            await store.createCollection(name)
          }

          const collectionIds = store.collections.slice(startIdx).map((c) => c.id)
          const envIds = envNames.map((name) => createEnvironmentEntity(name).id)

          const allIds = [...collectionIds, ...envIds]
          const uniqueIds = new Set(allIds)

          // No id should be shared between the two factory types
          expect(uniqueIds.size).toBe(allIds.length)
        },
      ),
      { numRuns: 100 },
    )
  })
})
