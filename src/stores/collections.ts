import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/db'
import type { Collection, Folder, Request } from '@/types'

/**
 * Shape of the drag event emitted by vuedraggable.
 * The `collectionId` and `folderId` fields are injected by the
 * CollectionTree component to identify the drop target context.
 */
export interface DragEvent {
  moved?: { element: Request | Folder; oldIndex: number; newIndex: number }
  added?: { element: Request | Folder; newIndex: number }
  removed?: { element: Request | Folder; oldIndex: number }
  collectionId: string
  folderId?: string | null
  listType: 'requests' | 'folders'
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Deep-clone an object using structured clone (available in modern browsers and Node ≥ 17). */
function deepClone<T>(value: T): T {
  return structuredClone(value)
}

/** Recursively collect every id in a Folder subtree (folder ids + request ids). */
function collectDescendantIds(folder: Folder): Set<string> {
  const ids = new Set<string>()
  ids.add(folder.id)
  for (const req of folder.requests) ids.add(req.id)
  for (const sub of folder.folders) {
    for (const id of collectDescendantIds(sub)) ids.add(id)
  }
  return ids
}

/** Find the folder with the given id inside a folders array (recursive). Returns null if not found. */
function findFolder(folders: Folder[], id: string): Folder | null {
  for (const f of folders) {
    if (f.id === id) return f
    const found = findFolder(f.folders, id)
    if (found) return found
  }
  return null
}

/**
 * Insert `newFolder` into the correct parent inside `collection`.
 * If `parentFolderId` is null/undefined, inserts at the collection root.
 * Returns true on success.
 */
function insertFolder(collection: Collection, parentFolderId: string | null | undefined, newFolder: Folder): boolean {
  if (!parentFolderId) {
    collection.folders.push(newFolder)
    return true
  }
  const parent = findFolder(collection.folders, parentFolderId)
  if (!parent) return false
  parent.folders.push(newFolder)
  return true
}

/**
 * Rename the folder with the given id inside `collection`.
 * Returns true on success.
 */
function renameFolderInTree(collection: Collection, id: string, name: string): boolean {
  const folder = findFolder(collection.folders, id)
  if (!folder) return false
  folder.name = name
  return true
}

/**
 * Remove the folder with the given id from its parent's folders array (recursive).
 * Returns true if removed.
 */
function removeFolderFromTree(foldersArray: Folder[], id: string): boolean {
  const idx = foldersArray.findIndex((f) => f.id === id)
  if (idx !== -1) {
    foldersArray.splice(idx, 1)
    return true
  }
  for (const f of foldersArray) {
    if (removeFolderFromTree(f.folders, id)) return true
  }
  return false
}

/**
 * Find the request with the given id anywhere in a collection's tree.
 * Returns the Request if found, null otherwise.
 */
function findRequestInCollection(collection: Collection, requestId: string): Request | null {
  for (const req of collection.requests) {
    if (req.id === requestId) return req
  }
  for (const folder of collection.folders) {
    const found = findRequestInFolder(folder, requestId)
    if (found) return found
  }
  return null
}

function findRequestInFolder(folder: Folder, requestId: string): Request | null {
  for (const req of folder.requests) {
    if (req.id === requestId) return req
  }
  for (const sub of folder.folders) {
    const found = findRequestInFolder(sub, requestId)
    if (found) return found
  }
  return null
}

/**
 * Replace the request with the given id anywhere in a collection's tree.
 * Returns true if replaced.
 */
function replaceRequestInCollection(collection: Collection, updated: Request): boolean {
  const idx = collection.requests.findIndex((r) => r.id === updated.id)
  if (idx !== -1) {
    collection.requests[idx] = updated
    return true
  }
  for (const folder of collection.folders) {
    if (replaceRequestInFolder(folder, updated)) return true
  }
  return false
}

function replaceRequestInFolder(folder: Folder, updated: Request): boolean {
  const idx = folder.requests.findIndex((r) => r.id === updated.id)
  if (idx !== -1) {
    folder.requests[idx] = updated
    return true
  }
  for (const sub of folder.folders) {
    if (replaceRequestInFolder(sub, updated)) return true
  }
  return false
}

/**
 * Remove a request by id from anywhere in a collection's tree.
 * Returns true if removed.
 */
function removeRequestFromCollection(collection: Collection, requestId: string): boolean {
  const idx = collection.requests.findIndex((r) => r.id === requestId)
  if (idx !== -1) {
    collection.requests.splice(idx, 1)
    return true
  }
  for (const folder of collection.folders) {
    if (removeRequestFromFolder(folder, requestId)) return true
  }
  return false
}

function removeRequestFromFolder(folder: Folder, requestId: string): boolean {
  const idx = folder.requests.findIndex((r) => r.id === requestId)
  if (idx !== -1) {
    folder.requests.splice(idx, 1)
    return true
  }
  for (const sub of folder.folders) {
    if (removeRequestFromFolder(sub, requestId)) return true
  }
  return false
}

// ─── store ───────────────────────────────────────────────────────────────────

export const useCollectionsStore = defineStore('collections', () => {
  const collections = ref<Collection[]>([])

  /**
   * Load all collections from IndexedDB into state.
   * Called once on application mount.
   */
  async function init(): Promise<void> {
    const database = await db
    collections.value = await database.getAll('collections')
  }

  /**
   * Create a new collection with the given name.
   * Persists to idb first; updates state on success.
   */
  async function createCollection(name: string): Promise<void> {
    const newCol: Collection = {
      id: crypto.randomUUID(),
      name,
      folders: [],
      requests: [],
    }
    try {
      const database = await db
      await database.put('collections', newCol)
      collections.value.push(newCol)
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to create collection. Please try again.')
    }
  }

  /**
   * Rename the collection with the given id.
   * Persists to idb first; updates state on success.
   */
  async function renameCollection(id: string, name: string): Promise<void> {
    const existing = collections.value.find((c) => c.id === id)
    if (!existing) return
    const updated: Collection = deepClone(existing)
    updated.name = name
    try {
      const database = await db
      await database.put('collections', updated)
      const idx = collections.value.findIndex((c) => c.id === id)
      if (idx !== -1) collections.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to rename collection. Please try again.')
    }
  }

  /**
   * Delete the collection with the given id (and all its descendants).
   * Persists to idb first; updates state on success.
   */
  async function deleteCollection(id: string): Promise<void> {
    try {
      const database = await db
      await database.delete('collections', id)
      collections.value = collections.value.filter((c) => c.id !== id)
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to delete collection. Please try again.')
    }
  }

  /**
   * Create a new folder inside a collection, optionally nested under a parent folder.
   * Persists the updated collection to idb first; updates state on success.
   */
  async function createFolder(
    collectionId: string,
    parentFolderId: string | null,
    name: string,
  ): Promise<void> {
    const existing = collections.value.find((c) => c.id === collectionId)
    if (!existing) return
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name,
      folders: [],
      requests: [],
    }
    const updated: Collection = deepClone(existing)
    insertFolder(updated, parentFolderId, newFolder)
    try {
      const database = await db
      await database.put('collections', updated)
      const idx = collections.value.findIndex((c) => c.id === collectionId)
      if (idx !== -1) collections.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to create folder. Please try again.')
    }
  }

  /**
   * Rename the folder with the given id (scans all collections).
   * Persists to idb first; updates state on success.
   */
  async function renameFolder(id: string, name: string): Promise<void> {
    const owningCollection = collections.value.find((c) => findFolder(c.folders, id))
    if (!owningCollection) return
    const updated: Collection = deepClone(owningCollection)
    renameFolderInTree(updated, id, name)
    try {
      const database = await db
      await database.put('collections', updated)
      const idx = collections.value.findIndex((c) => c.id === owningCollection.id)
      if (idx !== -1) collections.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to rename folder. Please try again.')
    }
  }

  /**
   * Delete the folder with the given id (and all its descendants).
   * Scans all collections; persists to idb first; updates state on success.
   */
  async function deleteFolder(id: string): Promise<void> {
    const owningCollection = collections.value.find((c) => findFolder(c.folders, id))
    if (!owningCollection) return
    const updated: Collection = deepClone(owningCollection)
    removeFolderFromTree(updated.folders, id)
    try {
      const database = await db
      await database.put('collections', updated)
      const idx = collections.value.findIndex((c) => c.id === owningCollection.id)
      if (idx !== -1) collections.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to delete folder. Please try again.')
    }
  }

  /**
   * Persist an updated request back to its owning collection.
   * Scans all collections to find which one contains this request.
   * Persists to idb first; updates state on success.
   */
  async function updateRequest(request: Request): Promise<void> {
    const owningCollection = collections.value.find(
      (c) => findRequestInCollection(c, request.id) !== null,
    )
    if (!owningCollection) return
    const updated: Collection = deepClone(owningCollection)
    replaceRequestInCollection(updated, request)
    try {
      const database = await db
      await database.put('collections', updated)
      const idx = collections.value.findIndex((c) => c.id === owningCollection.id)
      if (idx !== -1) collections.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to save request. Please try again.')
    }
  }

  /**
   * Handle a vuedraggable drop event.
   *
   * The drag context (`collectionId`, `folderId`, `listType`) must be
   * attached to the event object by the CollectionTree component before
   * dispatching this action.
   *
   * Supported shapes:
   *   - `{ moved }` — reorder within the same list
   *   - `{ added, collectionId, folderId, listType }` — item dropped into a new list
   *   - `{ removed, collectionId, folderId, listType }` — item removed from source list
   *     (this is the companion event to `added`; typically both arrive and the
   *     consumer calls this action once per event object)
   */
  async function moveItem(dragEvent: DragEvent): Promise<void> {
    const { collectionId, folderId, listType, moved, added, removed } = dragEvent

    const collection = collections.value.find((c) => c.id === collectionId)
    if (!collection) return

    const updated: Collection = deepClone(collection)

    /** Resolve the target list (requests[] or folders[]) within the drop context. */
    function resolveList(col: Collection): (Request | Folder)[] {
      if (!folderId) {
        return listType === 'requests' ? (col.requests as (Request | Folder)[]) : (col.folders as (Request | Folder)[])
      }
      const folder = findFolder(col.folders, folderId)
      if (!folder) return []
      return listType === 'requests' ? (folder.requests as (Request | Folder)[]) : (folder.folders as (Request | Folder)[])
    }

    if (moved) {
      // Reorder within the same list
      const list = resolveList(updated)
      const [item] = list.splice(moved.oldIndex, 1)
      list.splice(moved.newIndex, 0, item)
    } else if (added) {
      // An item was dropped into this list from another list
      const list = resolveList(updated)
      list.splice(added.newIndex, 0, deepClone(added.element) as Request | Folder)
    } else if (removed) {
      // An item was dragged away from this list
      const list = resolveList(updated)
      list.splice(removed.oldIndex, 1)
    } else {
      return // nothing to do
    }

    try {
      const database = await db
      await database.put('collections', updated)
      const idx = collections.value.findIndex((c) => c.id === collectionId)
      if (idx !== -1) collections.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to reorder items. Please try again.')
    }
  }

  return {
    collections,
    init,
    createCollection,
    renameCollection,
    deleteCollection,
    createFolder,
    renameFolder,
    deleteFolder,
    updateRequest,
    moveItem,
    // expose helpers for testing
    _findFolder: findFolder,
    _collectDescendantIds: collectDescendantIds,
  }
})
