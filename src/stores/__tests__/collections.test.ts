/**
 * Unit tests for `src/stores/collections.ts`
 *
 * Strategy:
 *  - Mock `@/db` so every test controls idb success / failure independently.
 *  - Mock `@/stores/ui` so `showError` calls can be verified without a real
 *    Pinia uiStore being configured.
 *  - Each test creates a fresh Pinia instance via `createPinia()` so store
 *    state never leaks between tests.
 *
 * Coverage:
 *  - init() loads all collections from idb into state
 *  - createCollection() adds a new collection with correct structure
 *  - renameCollection() updates the name field in state
 *  - deleteCollection() removes the collection and all its descendants
 *  - createFolder() inserts a folder at collection root or nested parent
 *  - renameFolder() updates the folder name inside its owning collection
 *  - deleteFolder() removes the folder and all nested descendants
 *  - updateRequest() replaces a request in its owning collection
 *  - moveItem() reorders items within and across lists
 *  - idb failure leaves state unchanged and calls uiStore.showError()
 *
 * Requirements: 1.2, 1.3, 1.4, 1.7, 1.9
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Collection, Folder, Request } from '@/types'

// ─── Mock @/db ───────────────────────────────────────────────────────────────

// Use vi.hoisted so the mock object is created before vi.mock factories run.
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

// ─── Mock @/stores/ui ────────────────────────────────────────────────────────

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({ showError: mockShowError }),
}))

// ─── Import store (after mocks are in place) ─────────────────────────────────

import { useCollectionsStore } from '../collections'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: crypto.randomUUID(),
    name: 'Test Request',
    method: 'GET',
    url: 'https://example.com',
    headers: [],
    body: { type: 'json', content: '' },
    auth: { type: 'none' },
    ...overrides,
  }
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: crypto.randomUUID(),
    name: 'Test Folder',
    folders: [],
    requests: [],
    ...overrides,
  }
}

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: crypto.randomUUID(),
    name: 'Test Collection',
    folders: [],
    requests: [],
    ...overrides,
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  // Default: idb operations succeed
  mockDb.getAll.mockResolvedValue([])
  mockDb.put.mockResolvedValue(undefined)
  mockDb.delete.mockResolvedValue(undefined)
})

// ─── init() ──────────────────────────────────────────────────────────────────

describe('collectionsStore — init()', () => {
  it('loads all collections from idb into state', async () => {
    const col1 = makeCollection({ name: 'Alpha' })
    const col2 = makeCollection({ name: 'Beta' })
    mockDb.getAll.mockResolvedValue([col1, col2])

    const store = useCollectionsStore()
    await store.init()

    expect(store.collections).toHaveLength(2)
    expect(store.collections[0].name).toBe('Alpha')
    expect(store.collections[1].name).toBe('Beta')
    expect(mockDb.getAll).toHaveBeenCalledWith('collections')
  })

  it('results in an empty array when idb returns no collections', async () => {
    mockDb.getAll.mockResolvedValue([])

    const store = useCollectionsStore()
    await store.init()

    expect(store.collections).toHaveLength(0)
  })
})

// ─── createCollection() ──────────────────────────────────────────────────────

describe('collectionsStore — createCollection()', () => {
  it('adds a new collection with correct structure to state on success', async () => {
    const store = useCollectionsStore()
    await store.createCollection('My API')

    expect(store.collections).toHaveLength(1)
    const col = store.collections[0]
    expect(col.name).toBe('My API')
    expect(col.folders).toEqual([])
    expect(col.requests).toEqual([])
    expect(typeof col.id).toBe('string')
    expect(col.id).toMatch(/^[0-9a-f-]{36}$/) // UUID format
  })

  it('persists the new collection to idb before mutating state', async () => {
    const putOrder: string[] = []
    mockDb.put.mockImplementation(() => {
      putOrder.push('idb')
      return Promise.resolve()
    })

    const store = useCollectionsStore()
    const originalLength = store.collections.length

    // Intercept state mutation to track order
    let stateUpdatedAfterIdb = false
    mockDb.put.mockImplementation(() => {
      stateUpdatedAfterIdb = store.collections.length === originalLength // state not yet mutated
      return Promise.resolve()
    })

    await store.createCollection('Ordered')

    expect(stateUpdatedAfterIdb).toBe(true)
    expect(mockDb.put).toHaveBeenCalledOnce()
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useCollectionsStore()
    await store.createCollection('Will Fail')

    expect(store.collections).toHaveLength(0)
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to create collection')
  })
})

// ─── renameCollection() ──────────────────────────────────────────────────────

describe('collectionsStore — renameCollection()', () => {
  it('updates the collection name in state on success', async () => {
    const col = makeCollection({ name: 'Old Name' })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.renameCollection(col.id, 'New Name')

    expect(store.collections[0].name).toBe('New Name')
    expect(mockDb.put).toHaveBeenCalledOnce()
    const putArg = (mockDb.put as Mock).mock.calls[0][1] as Collection
    expect(putArg.name).toBe('New Name')
  })

  it('does nothing when the id is not found', async () => {
    const store = useCollectionsStore()
    await store.renameCollection('non-existent-id', 'New Name')

    expect(mockDb.put).not.toHaveBeenCalled()
    expect(store.collections).toHaveLength(0)
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const col = makeCollection({ name: 'Original' })
    mockDb.getAll.mockResolvedValue([col])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useCollectionsStore()
    await store.init()
    await store.renameCollection(col.id, 'Changed')

    expect(store.collections[0].name).toBe('Original')
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to rename collection')
  })
})

// ─── deleteCollection() ──────────────────────────────────────────────────────

describe('collectionsStore — deleteCollection()', () => {
  it('removes the collection from state on success', async () => {
    const col = makeCollection({ name: 'To Delete' })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.deleteCollection(col.id)

    expect(store.collections).toHaveLength(0)
    expect(mockDb.delete).toHaveBeenCalledWith('collections', col.id)
  })

  it('keeps other collections when deleting one', async () => {
    const col1 = makeCollection({ name: 'Keep' })
    const col2 = makeCollection({ name: 'Delete Me' })
    mockDb.getAll.mockResolvedValue([col1, col2])

    const store = useCollectionsStore()
    await store.init()
    await store.deleteCollection(col2.id)

    expect(store.collections).toHaveLength(1)
    expect(store.collections[0].id).toBe(col1.id)
  })

  it('removes all nested folders and requests when the collection is deleted', async () => {
    const req1 = makeRequest({ id: 'req-1' })
    const req2 = makeRequest({ id: 'req-2' })
    const subFolder = makeFolder({ id: 'sub-folder', requests: [req2] })
    const folder = makeFolder({ id: 'folder-1', folders: [subFolder], requests: [req1] })
    const col = makeCollection({ id: 'col-1', folders: [folder], requests: [] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.deleteCollection(col.id)

    // The collection and all descendants must be gone from state
    expect(store.collections).toHaveLength(0)

    // No collection, folder, or request with those ids should exist
    const allIds = store.collections.flatMap((c) => {
      const ids: string[] = [c.id]
      function collectIds(folders: Folder[]): void {
        for (const f of folders) {
          ids.push(f.id)
          f.requests.forEach((r) => ids.push(r.id))
          collectIds(f.folders)
        }
      }
      collectIds(c.folders)
      c.requests.forEach((r) => ids.push(r.id))
      return ids
    })

    expect(allIds).not.toContain('col-1')
    expect(allIds).not.toContain('folder-1')
    expect(allIds).not.toContain('sub-folder')
    expect(allIds).not.toContain('req-1')
    expect(allIds).not.toContain('req-2')
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const col = makeCollection({ name: 'Protected' })
    mockDb.getAll.mockResolvedValue([col])
    mockDb.delete.mockRejectedValue(new Error('idb delete failed'))

    const store = useCollectionsStore()
    await store.init()
    await store.deleteCollection(col.id)

    expect(store.collections).toHaveLength(1)
    expect(store.collections[0].id).toBe(col.id)
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to delete collection')
  })
})

// ─── createFolder() ──────────────────────────────────────────────────────────

describe('collectionsStore — createFolder()', () => {
  it('inserts a folder at collection root when parentFolderId is null', async () => {
    const col = makeCollection()
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.createFolder(col.id, null, 'Root Folder')

    expect(store.collections[0].folders).toHaveLength(1)
    expect(store.collections[0].folders[0].name).toBe('Root Folder')
    expect(store.collections[0].folders[0].folders).toEqual([])
    expect(store.collections[0].folders[0].requests).toEqual([])
    expect(typeof store.collections[0].folders[0].id).toBe('string')
  })

  it('inserts a nested folder under a parent folder', async () => {
    const parentFolder = makeFolder({ id: 'parent-id', name: 'Parent' })
    const col = makeCollection({ folders: [parentFolder] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.createFolder(col.id, 'parent-id', 'Child Folder')

    const parent = store.collections[0].folders[0]
    expect(parent.folders).toHaveLength(1)
    expect(parent.folders[0].name).toBe('Child Folder')
  })

  it('does nothing when collection id is not found', async () => {
    const store = useCollectionsStore()
    await store.createFolder('non-existent', null, 'Ghost Folder')

    expect(mockDb.put).not.toHaveBeenCalled()
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const col = makeCollection()
    mockDb.getAll.mockResolvedValue([col])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useCollectionsStore()
    await store.init()
    await store.createFolder(col.id, null, 'Failed Folder')

    expect(store.collections[0].folders).toHaveLength(0)
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to create folder')
  })
})

// ─── renameFolder() ──────────────────────────────────────────────────────────

describe('collectionsStore — renameFolder()', () => {
  it('updates the folder name in state on success', async () => {
    const folder = makeFolder({ id: 'folder-id', name: 'Old Folder' })
    const col = makeCollection({ folders: [folder] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.renameFolder('folder-id', 'New Folder Name')

    expect(store.collections[0].folders[0].name).toBe('New Folder Name')
    expect(mockDb.put).toHaveBeenCalledOnce()
  })

  it('renames a deeply nested folder', async () => {
    const deepFolder = makeFolder({ id: 'deep-id', name: 'Deep' })
    const midFolder = makeFolder({ id: 'mid-id', folders: [deepFolder] })
    const col = makeCollection({ folders: [midFolder] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.renameFolder('deep-id', 'Renamed Deep')

    const renamed = store.collections[0].folders[0].folders[0]
    expect(renamed.name).toBe('Renamed Deep')
  })

  it('does nothing when the folder id does not exist in any collection', async () => {
    const store = useCollectionsStore()
    await store.renameFolder('ghost-id', 'Ghost')

    expect(mockDb.put).not.toHaveBeenCalled()
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const folder = makeFolder({ id: 'folder-id', name: 'Original Name' })
    const col = makeCollection({ folders: [folder] })
    mockDb.getAll.mockResolvedValue([col])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useCollectionsStore()
    await store.init()
    await store.renameFolder('folder-id', 'New Name')

    expect(store.collections[0].folders[0].name).toBe('Original Name')
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to rename folder')
  })
})

// ─── deleteFolder() ──────────────────────────────────────────────────────────

describe('collectionsStore — deleteFolder()', () => {
  it('removes the folder from state on success', async () => {
    const folder = makeFolder({ id: 'folder-to-delete' })
    const col = makeCollection({ folders: [folder] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.deleteFolder('folder-to-delete')

    expect(store.collections[0].folders).toHaveLength(0)
    expect(mockDb.put).toHaveBeenCalledOnce()
  })

  it('removes all nested requests and sub-folders when the folder is deleted', async () => {
    const req1 = makeRequest({ id: 'req-in-folder' })
    const req2 = makeRequest({ id: 'req-in-subfolder' })
    const subFolder = makeFolder({ id: 'sub-id', requests: [req2] })
    const folder = makeFolder({ id: 'parent-folder', folders: [subFolder], requests: [req1] })
    const col = makeCollection({ id: 'col-id', folders: [folder] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.deleteFolder('parent-folder')

    const remainingCol = store.collections[0]
    expect(remainingCol.folders).toHaveLength(0)

    // Gather all descendant ids still present in state
    const allIds: string[] = []
    function collectIds(folders: Folder[]): void {
      for (const f of folders) {
        allIds.push(f.id)
        f.requests.forEach((r) => allIds.push(r.id))
        collectIds(f.folders)
      }
    }
    collectIds(remainingCol.folders)
    remainingCol.requests.forEach((r) => allIds.push(r.id))

    expect(allIds).not.toContain('parent-folder')
    expect(allIds).not.toContain('sub-id')
    expect(allIds).not.toContain('req-in-folder')
    expect(allIds).not.toContain('req-in-subfolder')
  })

  it('does not affect other folders in the same collection', async () => {
    const keep = makeFolder({ id: 'keep-id', name: 'Keep' })
    const remove = makeFolder({ id: 'remove-id', name: 'Remove' })
    const col = makeCollection({ folders: [keep, remove] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()
    await store.deleteFolder('remove-id')

    expect(store.collections[0].folders).toHaveLength(1)
    expect(store.collections[0].folders[0].id).toBe('keep-id')
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const folder = makeFolder({ id: 'folder-id' })
    const col = makeCollection({ folders: [folder] })
    mockDb.getAll.mockResolvedValue([col])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useCollectionsStore()
    await store.init()
    await store.deleteFolder('folder-id')

    expect(store.collections[0].folders).toHaveLength(1)
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to delete folder')
  })
})

// ─── updateRequest() ─────────────────────────────────────────────────────────

describe('collectionsStore — updateRequest()', () => {
  it('replaces a request at collection root level', async () => {
    const req = makeRequest({ id: 'req-id', name: 'Old Name', url: 'https://old.com' })
    const col = makeCollection({ requests: [req] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()

    const updated = { ...req, name: 'New Name', url: 'https://new.com' }
    await store.updateRequest(updated)

    expect(store.collections[0].requests[0].name).toBe('New Name')
    expect(store.collections[0].requests[0].url).toBe('https://new.com')
    expect(mockDb.put).toHaveBeenCalledOnce()
  })

  it('replaces a request nested inside a folder', async () => {
    const req = makeRequest({ id: 'nested-req', name: 'Original' })
    const folder = makeFolder({ id: 'folder-id', requests: [req] })
    const col = makeCollection({ folders: [folder] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()

    const updated = { ...req, name: 'Updated In Folder' }
    await store.updateRequest(updated)

    expect(store.collections[0].folders[0].requests[0].name).toBe('Updated In Folder')
  })

  it('does nothing when the request id is not found in any collection', async () => {
    const store = useCollectionsStore()
    const ghost = makeRequest({ id: 'ghost-id' })
    await store.updateRequest(ghost)

    expect(mockDb.put).not.toHaveBeenCalled()
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const req = makeRequest({ id: 'req-id', name: 'Original' })
    const col = makeCollection({ requests: [req] })
    mockDb.getAll.mockResolvedValue([col])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useCollectionsStore()
    await store.init()

    const updated = { ...req, name: 'Changed' }
    await store.updateRequest(updated)

    expect(store.collections[0].requests[0].name).toBe('Original')
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to save request')
  })
})

// ─── moveItem() ──────────────────────────────────────────────────────────────

describe('collectionsStore — moveItem()', () => {
  it('reorders requests within the same collection root via "moved" event', async () => {
    const req1 = makeRequest({ id: 'req-1', name: 'First' })
    const req2 = makeRequest({ id: 'req-2', name: 'Second' })
    const col = makeCollection({ id: 'col-id', requests: [req1, req2] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()

    await store.moveItem({
      collectionId: 'col-id',
      listType: 'requests',
      moved: { element: req1, oldIndex: 0, newIndex: 1 },
    })

    expect(store.collections[0].requests[0].id).toBe('req-2')
    expect(store.collections[0].requests[1].id).toBe('req-1')
    expect(mockDb.put).toHaveBeenCalledOnce()
  })

  it('adds an item to a list via "added" event', async () => {
    const req = makeRequest({ id: 'req-to-add' })
    const col = makeCollection({ id: 'col-id', requests: [] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()

    await store.moveItem({
      collectionId: 'col-id',
      listType: 'requests',
      added: { element: req, newIndex: 0 },
    })

    expect(store.collections[0].requests).toHaveLength(1)
    expect(store.collections[0].requests[0].id).toBe('req-to-add')
  })

  it('removes an item from a list via "removed" event', async () => {
    const req1 = makeRequest({ id: 'req-1' })
    const req2 = makeRequest({ id: 'req-2' })
    const col = makeCollection({ id: 'col-id', requests: [req1, req2] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()

    await store.moveItem({
      collectionId: 'col-id',
      listType: 'requests',
      removed: { element: req1, oldIndex: 0 },
    })

    expect(store.collections[0].requests).toHaveLength(1)
    expect(store.collections[0].requests[0].id).toBe('req-2')
  })

  it('reorders folders within a nested folder via "moved" event', async () => {
    const folderA = makeFolder({ id: 'folder-a', name: 'A' })
    const folderB = makeFolder({ id: 'folder-b', name: 'B' })
    const parentFolder = makeFolder({ id: 'parent', folders: [folderA, folderB] })
    const col = makeCollection({ id: 'col-id', folders: [parentFolder] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()

    await store.moveItem({
      collectionId: 'col-id',
      folderId: 'parent',
      listType: 'folders',
      moved: { element: folderA, oldIndex: 0, newIndex: 1 },
    })

    const parent = store.collections[0].folders[0]
    expect(parent.folders[0].id).toBe('folder-b')
    expect(parent.folders[1].id).toBe('folder-a')
  })

  it('does nothing when collection id is not found', async () => {
    const store = useCollectionsStore()

    await store.moveItem({
      collectionId: 'non-existent',
      listType: 'requests',
      moved: { element: makeRequest(), oldIndex: 0, newIndex: 1 },
    })

    expect(mockDb.put).not.toHaveBeenCalled()
  })

  it('leaves state unchanged and calls showError when idb throws on moveItem', async () => {
    const req1 = makeRequest({ id: 'req-1' })
    const req2 = makeRequest({ id: 'req-2' })
    const col = makeCollection({ id: 'col-id', requests: [req1, req2] })
    mockDb.getAll.mockResolvedValue([col])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useCollectionsStore()
    await store.init()

    await store.moveItem({
      collectionId: 'col-id',
      listType: 'requests',
      moved: { element: req1, oldIndex: 0, newIndex: 1 },
    })

    // State should be unchanged — original order preserved
    expect(store.collections[0].requests[0].id).toBe('req-1')
    expect(store.collections[0].requests[1].id).toBe('req-2')
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to reorder items')
  })
})

// ─── idb failure — general pattern ───────────────────────────────────────────

describe('collectionsStore — idb failure invariant', () => {
  it('never partially mutates state: collection count unchanged after failed createCollection', async () => {
    mockDb.put.mockRejectedValue(new Error('disk full'))
    const store = useCollectionsStore()

    const before = [...store.collections]
    await store.createCollection('Partial')

    expect(store.collections.length).toBe(before.length)
  })

  it('shows an error message for every failing CRUD action', async () => {
    mockDb.put.mockRejectedValue(new Error('fail'))
    mockDb.delete.mockRejectedValue(new Error('fail'))

    const folder = makeFolder({ id: 'f1' })
    const req = makeRequest({ id: 'r1' })
    const col = makeCollection({ id: 'c1', folders: [folder], requests: [req] })
    mockDb.getAll.mockResolvedValue([col])

    const store = useCollectionsStore()
    await store.init()

    await store.createCollection('X')
    await store.renameCollection(col.id, 'Y')
    await store.deleteCollection(col.id)
    await store.createFolder(col.id, null, 'Z')
    await store.renameFolder('f1', 'W')
    await store.deleteFolder('f1')
    await store.updateRequest({ ...req, name: 'Updated' })

    expect(mockShowError).toHaveBeenCalledTimes(7)
  })
})
