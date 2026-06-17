// Feature: postman, Property 8: Deletion Removes All Descendants

/**
 * Property-based tests for deletion descendant removal.
 *
 * Property 8: Deletion Removes All Descendants
 *   For any `Collection` containing arbitrarily nested `Folder` and `Request`
 *   nodes, after calling `deleteCollection(id)` the `collectionsStore` SHALL
 *   contain no object whose `id` matches any id from the original collection's
 *   entire descendant tree (folders, sub-folders, requests at every level).
 *
 *   The same invariant SHALL hold for `deleteFolder(id)`: after deletion, no
 *   descendant folder or request id from that folder's subtree remains in the
 *   store.
 *
 * Validates: Requirements 1.4, 1.7
 * Minimum iterations: 100
 */

import * as fc from 'fast-check'
import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Collection, Folder, Request, HttpMethod } from '@/types'

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

// ─── Store import (after mocks) ──────────────────────────────────────────────

import { useCollectionsStore } from '../collections'

// ─── fast-check global config ────────────────────────────────────────────────

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

// ─── Id helpers ──────────────────────────────────────────────────────────────

/**
 * Collect every id present in the store state — collection ids, folder ids
 * at every depth, and request ids at every depth.
 */
function collectAllIdsInStore(collections: Collection[]): Set<string> {
  const ids = new Set<string>()
  for (const col of collections) {
    ids.add(col.id)
    collectIdsFromFolders(col.folders, ids)
    for (const req of col.requests) ids.add(req.id)
  }
  return ids
}

function collectIdsFromFolders(folders: Folder[], ids: Set<string>): void {
  for (const folder of folders) {
    ids.add(folder.id)
    for (const req of folder.requests) ids.add(req.id)
    collectIdsFromFolders(folder.folders, ids)
  }
}

/**
 * Collect the full descendant id set for a Collection — every folder id and
 * request id at every nesting level, including the collection's own id.
 */
function collectCollectionDescendantIds(collection: Collection): Set<string> {
  const ids = new Set<string>()
  ids.add(collection.id)
  for (const req of collection.requests) ids.add(req.id)
  collectIdsFromFolders(collection.folders, ids)
  return ids
}

/**
 * Collect the full descendant id set for a Folder — the folder's own id,
 * every nested folder id, and every request id at any depth.
 */
function collectFolderDescendantIds(folder: Folder): Set<string> {
  const ids = new Set<string>()
  ids.add(folder.id)
  for (const req of folder.requests) ids.add(req.id)
  collectIdsFromFolders(folder.folders, ids)
  return ids
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates a short non-empty identifier string. */
const idArb = fc.uuid()

const methodArb = fc.constantFrom<HttpMethod>('GET', 'POST', 'PUT', 'PATCH', 'DELETE')

/** Generates an arbitrary Request object. */
const requestArb: fc.Arbitrary<Request> = fc.record({
  id: idArb,
  name: fc.string({ minLength: 1, maxLength: 40 }),
  method: methodArb,
  url: fc.webUrl(),
  headers: fc.constant([]),
  body: fc.record({
    type: fc.constantFrom<'json' | 'form' | 'x-www-form-urlencoded'>('json', 'form', 'x-www-form-urlencoded'),
    content: fc.string(),
  }),
  auth: fc.record({
    type: fc.constantFrom<'bearer' | 'basic' | 'none'>('bearer', 'basic', 'none'),
  }),
})

/**
 * Generates an arbitrarily nested Folder tree.
 * Depth is limited to 3 to keep test runtime reasonable.
 * Each folder can have 0–3 sub-folders and 0–3 requests.
 */
function folderArb(depth: number): fc.Arbitrary<Folder> {
  const requestsArb = fc.array(requestArb, { minLength: 0, maxLength: 3 })

  if (depth <= 0) {
    return fc.record({
      id: idArb,
      name: fc.string({ minLength: 1, maxLength: 30 }),
      folders: fc.constant([]),
      requests: requestsArb,
    })
  }

  return fc.record({
    id: idArb,
    name: fc.string({ minLength: 1, maxLength: 30 }),
    folders: fc.array(folderArb(depth - 1), { minLength: 0, maxLength: 3 }),
    requests: requestsArb,
  })
}

/**
 * Generates a Collection with arbitrarily nested folders (up to 3 levels)
 * and 0–3 root-level requests.
 */
const collectionArb: fc.Arbitrary<Collection> = fc.record({
  id: idArb,
  name: fc.string({ minLength: 1, maxLength: 50 }),
  folders: fc.array(folderArb(3), { minLength: 0, maxLength: 3 }),
  requests: fc.array(requestArb, { minLength: 0, maxLength: 3 }),
})

/**
 * Generates a Collection that is guaranteed to contain at least one folder
 * so `deleteFolder` has a valid target to exercise.
 */
const collectionWithFolderArb: fc.Arbitrary<{ collection: Collection; targetFolder: Folder }> =
  fc
    .record({
      id: idArb,
      name: fc.string({ minLength: 1, maxLength: 50 }),
      // At least one top-level folder
      folders: fc.array(folderArb(2), { minLength: 1, maxLength: 3 }),
      requests: fc.array(requestArb, { minLength: 0, maxLength: 3 }),
    })
    .map((collection) => ({
      collection,
      // Use the first top-level folder as the deletion target
      targetFolder: collection.folders[0],
    }))

// ─── Property 8a: deleteCollection removes all descendants ───────────────────

describe('Property 8 — deleteCollection: Removes All Descendants', () => {
  it('leaves no trace of any descendant id in the store after deleteCollection', async () => {
    await fc.assert(
      fc.asyncProperty(collectionArb, async (collection) => {
        const store = useCollectionsStore()
        // Seed the store with the generated collection
        mockDb.getAll.mockResolvedValue([collection])
        await store.init()

        // Collect the full descendant id set before deletion
        const descendantIds = collectCollectionDescendantIds(collection)

        // Perform deletion
        await store.deleteCollection(collection.id)

        // Inspect the store state after deletion
        const remainingIds = collectAllIdsInStore(store.collections)

        // No descendant id should survive
        for (const id of descendantIds) {
          expect(remainingIds.has(id)).toBe(false)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('does not affect sibling collections when one is deleted', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionArb,
        collectionArb,
        async (targetCollection, siblingCollection) => {
          // Ensure distinct ids so they don't accidentally overlap
          fc.pre(targetCollection.id !== siblingCollection.id)

          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([targetCollection, siblingCollection])
          await store.init()

          // Remember the sibling's full id set before the operation
          const siblingIds = collectCollectionDescendantIds(siblingCollection)

          await store.deleteCollection(targetCollection.id)

          const remainingIds = collectAllIdsInStore(store.collections)

          // The sibling collection itself must still be present
          expect(remainingIds.has(siblingCollection.id)).toBe(true)

          // All sibling descendant ids must still be present
          for (const id of siblingIds) {
            expect(remainingIds.has(id)).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('results in an empty store when the only collection is deleted', async () => {
    await fc.assert(
      fc.asyncProperty(collectionArb, async (collection) => {
        const store = useCollectionsStore()
        mockDb.getAll.mockResolvedValue([collection])
        await store.init()

        await store.deleteCollection(collection.id)

        expect(store.collections).toHaveLength(0)
        expect(collectAllIdsInStore(store.collections).size).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 8b: deleteFolder removes all descendants ───────────────────────

describe('Property 8 — deleteFolder: Removes All Descendants', () => {
  it('leaves no trace of any descendant folder or request id after deleteFolder', async () => {
    await fc.assert(
      fc.asyncProperty(collectionWithFolderArb, async ({ collection, targetFolder }) => {
        const store = useCollectionsStore()
        mockDb.getAll.mockResolvedValue([collection])
        await store.init()

        // Collect full descendant id set of the target folder before deletion
        const deletedIds = collectFolderDescendantIds(targetFolder)

        await store.deleteFolder(targetFolder.id)

        const remainingIds = collectAllIdsInStore(store.collections)

        // No id from the deleted subtree should remain
        for (const id of deletedIds) {
          expect(remainingIds.has(id)).toBe(false)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('preserves the owning collection and sibling folders after deleteFolder', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            id: idArb,
            name: fc.string({ minLength: 1, maxLength: 50 }),
            // At least two top-level folders so there is always a sibling
            folders: fc.array(folderArb(2), { minLength: 2, maxLength: 4 }),
            requests: fc.array(requestArb, { minLength: 0, maxLength: 3 }),
          })
          .map((collection) => ({
            collection,
            targetFolder: collection.folders[0],
            siblingFolder: collection.folders[1],
          })),
        async ({ collection, targetFolder, siblingFolder }) => {
          fc.pre(targetFolder.id !== siblingFolder.id)

          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          // Snapshot the sibling's ids before the operation
          const siblingIds = collectFolderDescendantIds(siblingFolder)

          await store.deleteFolder(targetFolder.id)

          const remainingIds = collectAllIdsInStore(store.collections)

          // The collection itself must still be present
          expect(remainingIds.has(collection.id)).toBe(true)

          // The sibling folder and all its descendants must still be present
          for (const id of siblingIds) {
            expect(remainingIds.has(id)).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('preserves root-level requests in the owning collection after deleteFolder', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            id: idArb,
            name: fc.string({ minLength: 1, maxLength: 50 }),
            folders: fc.array(folderArb(2), { minLength: 1, maxLength: 3 }),
            // At least one root-level request so there is always something to check
            requests: fc.array(requestArb, { minLength: 1, maxLength: 3 }),
          })
          .map((collection) => ({
            collection,
            targetFolder: collection.folders[0],
            rootRequestIds: collection.requests.map((r) => r.id),
          })),
        async ({ collection, targetFolder, rootRequestIds }) => {
          const store = useCollectionsStore()
          mockDb.getAll.mockResolvedValue([collection])
          await store.init()

          await store.deleteFolder(targetFolder.id)

          const remainingIds = collectAllIdsInStore(store.collections)

          // All root-level requests must be unaffected
          for (const id of rootRequestIds) {
            expect(remainingIds.has(id)).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 8c: composite — both operations are independently correct ───────

describe('Property 8 — composite: sequential deleteFolder then deleteCollection', () => {
  it('leaves a completely empty store after deleting a folder then its owning collection', async () => {
    await fc.assert(
      fc.asyncProperty(collectionWithFolderArb, async ({ collection, targetFolder }) => {
        const store = useCollectionsStore()
        mockDb.getAll.mockResolvedValue([collection])
        await store.init()

        // First delete a nested folder, then the entire collection
        await store.deleteFolder(targetFolder.id)
        await store.deleteCollection(collection.id)

        expect(store.collections).toHaveLength(0)
        expect(collectAllIdsInStore(store.collections).size).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})
