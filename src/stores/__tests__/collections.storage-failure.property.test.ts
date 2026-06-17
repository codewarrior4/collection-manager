// Feature: postman, Property 9: Storage Failure Preserves In-Memory State

/**
 * Property-based tests verifying that when idb throws on every write
 * operation, ANY mutating action on the collectionsStore leaves the Pinia
 * state IDENTICAL (bit-for-bit) to what it was before the action was
 * dispatched.
 *
 * Property 9: Storage Failure Preserves In-Memory State
 *   When a Storage (IndexedDB) write operation throws, the Pinia
 *   collectionsStore SHALL NOT mutate its `collections` state. The state
 *   after the failed action MUST be deep-equal to the state that existed
 *   before the action was called.
 *
 * Validates: Requirements 1.9
 * Minimum iterations: 100
 */

import * as fc from 'fast-check'
import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Collection, Folder, Request, HttpMethod } from '@/types'

// ─── Mocks ───────────────────────────────────────────────────────────────────
// We use vi.hoisted to ensure the mock objects exist before vi.mock factories.

const { mockDb, mockShowError } = vi.hoisted(() => {
  const mockDb = {
    getAll: vi.fn(),
    // All write methods throw by default — overridden in setup
    put: vi.fn(),
    add: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
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

// ─── Store import (must come after vi.mock calls) ─────────────────────────────

import { useCollectionsStore } from '../collections'
import type { DragEvent } from '../collections'

// ─── Global fast-check configuration ─────────────────────────────────────────

beforeAll(() => {
  fc.configureGlobal({ numRuns: 100 })
})

// ─── Per-test setup ───────────────────────────────────────────────────────────

const IDB_WRITE_ERROR = new Error('idb: simulated write failure')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()

  // Reads succeed so we can seed state via init()
  mockDb.getAll.mockResolvedValue([])

  // ALL writes throw — this is the invariant under test
  mockDb.put.mockRejectedValue(IDB_WRITE_ERROR)
  mockDb.add.mockRejectedValue(IDB_WRITE_ERROR)
  mockDb.delete.mockRejectedValue(IDB_WRITE_ERROR)
  mockDb.clear.mockRejectedValue(IDB_WRITE_ERROR)
})

// ─── State snapshot helper ────────────────────────────────────────────────────

/** Capture a deep-cloned, serialisable snapshot of the store's collections. */
function snapshotState(store: ReturnType<typeof useCollectionsStore>): Collection[] {
  return JSON.parse(JSON.stringify(store.collections))
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const methodArb = fc.constantFrom<HttpMethod>('GET', 'POST', 'PUT', 'PATCH', 'DELETE')

const requestArb: fc.Arbitrary<Request> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  method: methodArb,
  url: fc.webUrl(),
  headers: fc.constant([]),
  body: fc.record({
    type: fc.constantFrom<'json' | 'form' | 'x-www-form-urlencoded'>(
      'json',
      'form',
      'x-www-form-urlencoded',
    ),
    content: fc.string(),
  }),
  auth: fc.record({
    type: fc.constantFrom<'bearer' | 'basic' | 'none'>('bearer', 'basic', 'none'),
  }),
})

function folderArb(depth: number): fc.Arbitrary<Folder> {
  const requestsArb = fc.array(requestArb, { minLength: 0, maxLength: 2 })
  if (depth <= 0) {
    return fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      folders: fc.constant([]),
      requests: requestsArb,
    })
  }
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    folders: fc.array(folderArb(depth - 1), { minLength: 0, maxLength: 2 }),
    requests: requestsArb,
  })
}

/** Arbitrary Collection with up to 2 levels of folder nesting. */
const collectionArb: fc.Arbitrary<Collection> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  folders: fc.array(folderArb(2), { minLength: 0, maxLength: 2 }),
  requests: fc.array(requestArb, { minLength: 0, maxLength: 2 }),
})

/** A collection guaranteed to have at least one top-level folder. */
const collectionWithFolderArb = fc
  .record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    folders: fc.array(folderArb(1), { minLength: 1, maxLength: 3 }),
    requests: fc.array(requestArb, { minLength: 0, maxLength: 2 }),
  })
  .map((col) => ({ collection: col, targetFolder: col.folders[0] }))

/** A collection guaranteed to have at least one root-level request. */
const collectionWithRequestArb = fc
  .record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    folders: fc.array(folderArb(1), { minLength: 0, maxLength: 2 }),
    requests: fc.array(requestArb, { minLength: 1, maxLength: 3 }),
  })
  .map((col) => ({ collection: col, targetRequest: col.requests[0] }))

// ─── Property 9a: createCollection ───────────────────────────────────────────

describe('Property 9 — createCollection: idb failure leaves state unchanged', () => {
  it('state is identical before and after a failed createCollection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(collectionArb, { minLength: 0, maxLength: 3 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (existingCollections, newName) => {
          const store = useCollectionsStore()
          // Temporarily allow reads so we can seed state
          mockDb.getAll.mockResolvedValue(existingCollections)
          await store.init()

          const before = snapshotState(store)

          // idb put already throws — action should leave state untouched
          await store.createCollection(newName)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 9b: renameCollection ───────────────────────────────────────────

describe('Property 9 — renameCollection: idb failure leaves state unchanged', () => {
  it('state is identical before and after a failed renameCollection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(collectionArb, { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (existingCollections, newName) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue(existingCollections)
          await store.init()

          // Pick the first collection as rename target
          const targetId = store.collections[0].id
          const before = snapshotState(store)

          await store.renameCollection(targetId, newName)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 9c: deleteCollection ───────────────────────────────────────────

describe('Property 9 — deleteCollection: idb failure leaves state unchanged', () => {
  it('state is identical before and after a failed deleteCollection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(collectionArb, { minLength: 1, maxLength: 3 }),
        async (existingCollections) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue(existingCollections)
          await store.init()

          const targetId = store.collections[0].id
          const before = snapshotState(store)

          await store.deleteCollection(targetId)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 9d: createFolder ───────────────────────────────────────────────

describe('Property 9 — createFolder: idb failure leaves state unchanged', () => {
  it('state is identical before and after a failed createFolder (at collection root)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(collectionArb, { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 1, maxLength: 40 }),
        async (existingCollections, folderName) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue(existingCollections)
          await store.init()

          const targetCollectionId = store.collections[0].id
          const before = snapshotState(store)

          await store.createFolder(targetCollectionId, null, folderName)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('state is identical before and after a failed createFolder (nested under a folder)', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionWithFolderArb,
        fc.string({ minLength: 1, maxLength: 40 }),
        async ({ collection, targetFolder }, folderName) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          const before = snapshotState(store)

          await store.createFolder(collection.id, targetFolder.id, folderName)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 9e: renameFolder ───────────────────────────────────────────────

describe('Property 9 — renameFolder: idb failure leaves state unchanged', () => {
  it('state is identical before and after a failed renameFolder', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionWithFolderArb,
        fc.string({ minLength: 1, maxLength: 40 }),
        async ({ collection, targetFolder }, newName) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          const before = snapshotState(store)

          await store.renameFolder(targetFolder.id, newName)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 9f: deleteFolder ───────────────────────────────────────────────

describe('Property 9 — deleteFolder: idb failure leaves state unchanged', () => {
  it('state is identical before and after a failed deleteFolder', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionWithFolderArb,
        async ({ collection, targetFolder }) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          const before = snapshotState(store)

          await store.deleteFolder(targetFolder.id)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 9g: updateRequest ──────────────────────────────────────────────

describe('Property 9 — updateRequest: idb failure leaves state unchanged', () => {
  it('state is identical before and after a failed updateRequest', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionWithRequestArb,
        fc.string({ minLength: 1, maxLength: 40 }),
        async ({ collection, targetRequest }, newName) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          const before = snapshotState(store)

          // Attempt to update the request with a new name
          await store.updateRequest({ ...targetRequest, name: newName })

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 9h: moveItem ────────────────────────────────────────────────────

describe('Property 9 — moveItem: idb failure leaves state unchanged', () => {
  it('state is identical before and after a failed moveItem (reorder requests)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            folders: fc.constant([]),
            // At least 2 requests to have something to reorder
            requests: fc.array(requestArb, { minLength: 2, maxLength: 4 }),
          })
          .map((col) => col as Collection),
        async (collection) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          const before = snapshotState(store)

          const req0 = store.collections[0].requests[0]
          const dragEvent: DragEvent = {
            collectionId: collection.id,
            listType: 'requests',
            moved: { element: req0, oldIndex: 0, newIndex: 1 },
          }

          await store.moveItem(dragEvent)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('state is identical before and after a failed moveItem (add request via "added")', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionArb,
        requestArb,
        async (collection, incomingRequest) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          const before = snapshotState(store)

          const dragEvent: DragEvent = {
            collectionId: collection.id,
            listType: 'requests',
            added: { element: incomingRequest, newIndex: 0 },
          }

          await store.moveItem(dragEvent)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('state is identical before and after a failed moveItem (remove via "removed")', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            folders: fc.constant([]),
            requests: fc.array(requestArb, { minLength: 1, maxLength: 4 }),
          })
          .map((col) => col as Collection),
        async (collection) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          const before = snapshotState(store)

          const req0 = store.collections[0].requests[0]
          const dragEvent: DragEvent = {
            collectionId: collection.id,
            listType: 'requests',
            removed: { element: req0, oldIndex: 0 },
          }

          await store.moveItem(dragEvent)

          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 9i: composite — all mutation types in sequence ─────────────────

describe('Property 9 — composite: all mutating actions in sequence leave state unchanged', () => {
  it('state remains identical after applying ALL mutation types when idb fails for each', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionWithFolderArb.filter(
          ({ collection }) => collection.requests.length > 0,
        ),
        fc.string({ minLength: 1, maxLength: 40 }),
        async ({ collection, targetFolder }, arbitraryName) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          // Snapshot ONCE before any mutations
          const before = snapshotState(store)

          const colId = collection.id
          const folderId = targetFolder.id
          const requestToUpdate = collection.requests[0]

          // Fire every mutating action in sequence
          await store.createCollection(arbitraryName)
          await store.renameCollection(colId, arbitraryName)
          await store.createFolder(colId, null, arbitraryName)
          await store.createFolder(colId, folderId, arbitraryName)
          await store.renameFolder(folderId, arbitraryName)
          await store.updateRequest({ ...requestToUpdate, name: arbitraryName })
          await store.deleteFolder(folderId)
          await store.deleteCollection(colId)

          // After ALL failing writes, state must equal the initial snapshot
          const after = snapshotState(store)
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 100 },
    )
  })
})
