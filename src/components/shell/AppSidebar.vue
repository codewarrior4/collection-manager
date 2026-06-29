<script setup lang="ts">
/**
 * AppSidebar — left-hand panel with the Collections tree.
 *
 * Renders a "New Collection" inline input at the top, followed by
 * <CollectionTree>. Handles rename/delete contextmenu events from
 * CollectionTree by showing an inline confirmation/input UI.
 */
import { ref, nextTick } from 'vue'
import CollectionTree from './CollectionTree.vue'
import { useCollectionsStore } from '@/stores/collections'

// ─── Stores ───────────────────────────────────────────────────────────────────

const collectionsStore = useCollectionsStore()

// ─── New collection inline input ──────────────────────────────────────────────

const showNewCollectionInput = ref(false)
const newCollectionName = ref('')
const newCollectionInputEl = ref<HTMLInputElement | null>(null)

async function openNewCollectionInput(): Promise<void> {
  newCollectionName.value = ''
  showNewCollectionInput.value = true
  await nextTick()
  newCollectionInputEl.value?.focus()
}

async function submitNewCollection(): Promise<void> {
  const name = newCollectionName.value.trim()
  if (!name) {
    cancelNewCollection()
    return
  }
  await collectionsStore.createCollection(name)
  cancelNewCollection()
}

function cancelNewCollection(): void {
  showNewCollectionInput.value = false
  newCollectionName.value = ''
}

function onNewCollectionKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') submitNewCollection()
  else if (event.key === 'Escape') cancelNewCollection()
}

// ─── Context-menu actions (rename / delete) ───────────────────────────────────

type ContextMenuPayload = {
  type: 'collection' | 'folder' | 'request'
  action: 'rename' | 'delete'
  id: string
  collectionId: string
  name: string
}

/** Which node is currently being renamed inline, or null. */
const renamingId = ref<string | null>(null)
const renameInputValue = ref('')
const renameInputEl = ref<HTMLInputElement | null>(null)

/** Which node is pending a delete confirmation, or null. */
const deletingId = ref<string | null>(null)
const deletingPayload = ref<ContextMenuPayload | null>(null)

async function handleContextmenu(payload: ContextMenuPayload): Promise<void> {
  if (payload.action === 'rename') {
    deletingId.value = null
    deletingPayload.value = null
    renamingId.value = payload.id
    renameInputValue.value = payload.name
    await nextTick()
    renameInputEl.value?.focus()
    renameInputEl.value?.select()
  } else {
    renamingId.value = null
    deletingId.value = payload.id
    deletingPayload.value = payload
  }
}

async function submitRename(): Promise<void> {
  if (!renamingId.value) return
  const name = renameInputValue.value.trim()
  if (!name) {
    cancelRename()
    return
  }
  deletingId.value = null
  deletingPayload.value = null

  // Find what type of node this is by checking the payload stored at rename time.
  // We re-derive by looking up across collections/folders.
  const col = collectionsStore.collections.find((c) => c.id === renamingId.value)
  if (col) {
    await collectionsStore.renameCollection(renamingId.value, name)
  } else {
    await collectionsStore.renameFolder(renamingId.value, name)
  }
  renamingId.value = null
}

function cancelRename(): void {
  renamingId.value = null
  renameInputValue.value = ''
}

function onRenameKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') submitRename()
  else if (event.key === 'Escape') cancelRename()
}

async function confirmDelete(): Promise<void> {
  if (!deletingPayload.value) return
  const { type, id } = deletingPayload.value
  deletingId.value = null
  deletingPayload.value = null

  if (type === 'collection') {
    await collectionsStore.deleteCollection(id)
  } else if (type === 'folder') {
    await collectionsStore.deleteFolder(id)
  }
  // Requests are deleted via deleteFolder/deleteCollection cascading —
  // direct request deletion is handled by the RequestBuilder via updateRequest.
}

function cancelDelete(): void {
  deletingId.value = null
  deletingPayload.value = null
}
</script>

<template>
  <aside
    class="flex flex-col w-64 shrink-0 bg-dark-card border-r border-dark-border overflow-hidden"
    aria-label="Collections sidebar"
  >
    <!-- ── Header: "New Collection" ──────────────────────────────────────── -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-dark-border">
      <span class="flex-1 text-xs font-semibold uppercase tracking-wide text-text-secondary select-none">
        Collections
      </span>
      <button
        v-if="!showNewCollectionInput"
        type="button"
        class="flex items-center justify-center h-6 w-6 rounded
               text-text-secondary hover:text-primary hover:bg-dark-hover
               transition-colors"
        title="New collection"
        aria-label="Create new collection"
        @click="openNewCollectionInput"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>

    <!-- ── New Collection inline input ───────────────────────────────────── -->
    <div
      v-if="showNewCollectionInput"
      class="flex items-center gap-1.5 px-2 py-1.5 border-b border-dark-border bg-dark-elevated"
    >
      <input
        ref="newCollectionInputEl"
        v-model="newCollectionName"
        type="text"
        placeholder="Collection name…"
        maxlength="120"
        class="flex-1 h-7 rounded border border-dark-border bg-dark-surface px-2 text-sm
               text-text-primary placeholder:text-dark-muted
               focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
               transition-colors"
        aria-label="New collection name"
        @keydown="onNewCollectionKeydown"
        @blur="submitNewCollection"
      />
      <!-- Confirm -->
      <button
        type="button"
        class="flex items-center justify-center h-7 w-7 rounded text-success
               hover:bg-dark-hover transition-colors"
        title="Create collection"
        aria-label="Confirm new collection"
        @mousedown.prevent="submitNewCollection"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414
               0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
      <!-- Cancel -->
      <button
        type="button"
        class="flex items-center justify-center h-7 w-7 rounded text-text-secondary
               hover:text-danger hover:bg-dark-hover transition-colors"
        title="Cancel"
        aria-label="Cancel new collection"
        @mousedown.prevent="cancelNewCollection"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0
               111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414
               1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586
               10 4.293 5.707a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>

    <!-- ── Inline rename overlay ─────────────────────────────────────────── -->
    <div
      v-if="renamingId !== null"
      class="flex items-center gap-1.5 px-2 py-1.5 border-b border-dark-border bg-dark-elevated"
    >
      <input
        ref="renameInputEl"
        v-model="renameInputValue"
        type="text"
        placeholder="New name…"
        maxlength="120"
        class="flex-1 h-7 rounded border border-primary bg-dark-surface px-2 text-sm
               text-text-primary placeholder:text-dark-muted
               focus:outline-none focus:ring-1 focus:ring-primary
               transition-colors"
        aria-label="Rename"
        @keydown="onRenameKeydown"
        @blur="submitRename"
      />
      <button
        type="button"
        class="flex items-center justify-center h-7 w-7 rounded text-success
               hover:bg-dark-hover transition-colors"
        title="Confirm rename"
        @mousedown.prevent="submitRename"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
      </button>
      <button
        type="button"
        class="flex items-center justify-center h-7 w-7 rounded text-text-secondary
               hover:text-danger hover:bg-dark-hover transition-colors"
        title="Cancel rename"
        @mousedown.prevent="cancelRename"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>

    <!-- ── Delete confirmation ────────────────────────────────────────────── -->
    <div
      v-if="deletingId !== null && deletingPayload !== null"
      class="mx-2 my-1.5 rounded border border-danger/30 bg-dark-elevated px-3 py-2"
      role="alertdialog"
      :aria-label="`Confirm delete ${deletingPayload.name}`"
    >
      <p class="text-xs text-text-primary mb-2 leading-snug">
        Delete <strong class="font-semibold">"{{ deletingPayload.name }}"</strong>?
        <span v-if="deletingPayload.type !== 'request'" class="text-dark-muted"> All nested items will be removed.</span>
      </p>
      <div class="flex gap-1.5">
        <button
          type="button"
          class="flex-1 h-7 rounded text-xs font-medium bg-danger/20 text-danger
                 hover:bg-danger/30 transition-colors"
          @click="confirmDelete"
        >
          Delete
        </button>
        <button
          type="button"
          class="flex-1 h-7 rounded text-xs font-medium bg-dark-hover text-text-secondary
                 hover:text-text-primary transition-colors"
          @click="cancelDelete"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- ── Collection Tree ────────────────────────────────────────────────── -->
    <div class="flex-1 overflow-y-auto py-1 px-1">
      <CollectionTree @contextmenu="handleContextmenu" />
    </div>
  </aside>
</template>
