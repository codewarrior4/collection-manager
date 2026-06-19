<script setup lang="ts">
/**
 * CollectionTree — recursive tree component.
 *
 * Renders a list of Collections, each expandable to show Folders and Requests.
 * Supports drag-and-drop reordering via vuedraggable.
 * Emits `contextmenu` events so AppSidebar can show rename/delete menus.
 */
import { ref } from 'vue'
import draggable from 'vuedraggable'
import { useCollectionsStore, type DragEvent } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import type { Collection, Folder, Request } from '@/types'

// ─── Stores ───────────────────────────────────────────────────────────────────

const collectionsStore = useCollectionsStore()
const uiStore = useUiStore()

// ─── Emits ────────────────────────────────────────────────────────────────────

const emit = defineEmits<{
  /**
   * Fired when the user right-clicks (or clicks the ⋯ button) on a node.
   * The payload describes the item and which action was requested.
   */
  contextmenu: [
    payload: {
      type: 'collection' | 'folder' | 'request'
      action: 'rename' | 'delete'
      id: string
      collectionId: string
      name: string
    },
  ]
}>()

// ─── Expanded state ───────────────────────────────────────────────────────────

/** Set of ids that are currently expanded. */
const expanded = ref(new Set<string>())

function toggleExpanded(id: string): void {
  if (expanded.value.has(id)) {
    expanded.value.delete(id)
  } else {
    expanded.value.add(id)
  }
  // Trigger reactivity by replacing the set reference.
  expanded.value = new Set(expanded.value)
}

function isExpanded(id: string): boolean {
  return expanded.value.has(id)
}

// ─── HTTP method badge helpers ─────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET:    'text-method-get',
  POST:   'text-method-post',
  PUT:    'text-method-put',
  PATCH:  'text-method-patch',
  DELETE: 'text-method-delete',
}

function methodColor(method: string): string {
  return METHOD_COLORS[method.toUpperCase()] ?? 'text-text-secondary'
}

// ─── Active request helpers ────────────────────────────────────────────────────

function isActiveRequest(id: string): boolean {
  return uiStore.activeRequestId === id
}

function openRequest(request: Request): void {
  uiStore.setActiveRequest(request.id)
}

// ─── Context-menu helpers ─────────────────────────────────────────────────────

function emitContextmenu(
  type: 'collection' | 'folder' | 'request',
  action: 'rename' | 'delete',
  id: string,
  collectionId: string,
  name: string,
  event: MouseEvent,
): void {
  event.preventDefault()
  emit('contextmenu', { type, action, id, collectionId, name })
}

// ─── Drag-and-drop ────────────────────────────────────────────────────────────

function onDragChange(
  rawEvent: Record<string, unknown>,
  collectionId: string,
  folderId: string | null,
  listType: 'requests' | 'folders',
): void {
  const dragEvent: DragEvent = {
    ...(rawEvent as Omit<DragEvent, 'collectionId' | 'folderId' | 'listType'>),
    collectionId,
    folderId,
    listType,
  }
  collectionsStore.moveItem(dragEvent)
}
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <!--
      ── Collections ──────────────────────────────────────────────────────────
    -->
    <div
      v-for="collection in collectionsStore.collections"
      :key="collection.id"
      class="select-none"
    >
      <!-- Collection header row -->
      <div
        class="group flex items-center gap-1 rounded px-1 py-1 cursor-pointer
               text-text-secondary hover:bg-dark-hover hover:text-text-primary
               transition-colors"
        :class="{ 'bg-dark-hover text-text-primary': isExpanded(collection.id) }"
        @click="toggleExpanded(collection.id)"
        @contextmenu.prevent="($event) => {/* right-click handled via buttons */}"
      >
        <!-- Chevron toggle -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-3.5 w-3.5 shrink-0 transition-transform duration-150"
          :class="isExpanded(collection.id) ? 'rotate-90' : ''"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0
               011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clip-rule="evenodd"
          />
        </svg>

        <!-- Folder icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 shrink-0 text-primary/70"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2
               2H4a2 2 0 01-2-2V6z"
          />
        </svg>

        <!-- Collection name -->
        <span class="flex-1 truncate text-sm font-medium leading-none">
          {{ collection.name }}
        </span>

        <!-- Action buttons (visible on hover) -->
        <div
          class="hidden group-hover:flex items-center gap-0.5 shrink-0"
          @click.stop
        >
          <!-- Rename -->
          <button
            type="button"
            class="rounded p-0.5 text-text-secondary hover:text-text-primary
                   hover:bg-dark-active transition-colors"
            title="Rename collection"
            :aria-label="`Rename collection ${collection.name}`"
            @click.stop="emitContextmenu('collection', 'rename', collection.id, collection.id, collection.name, $event)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3.5 w-3.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379
                   5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
              />
            </svg>
          </button>
          <!-- Delete -->
          <button
            type="button"
            class="rounded p-0.5 text-text-secondary hover:text-danger
                   hover:bg-dark-active transition-colors"
            title="Delete collection"
            :aria-label="`Delete collection ${collection.name}`"
            @click.stop="emitContextmenu('collection', 'delete', collection.id, collection.id, collection.name, $event)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3.5 w-3.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0
                   002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1
                   1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1
                   1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Collection children (folders + requests) -->
      <div
        v-if="isExpanded(collection.id)"
        class="ml-3 border-l border-dark-border pl-1.5"
      >
        <!-- ── Root-level folders (draggable) ─────────────────────────── -->
        <draggable
          :list="collection.folders"
          :group="{ name: 'folders-' + collection.id }"
          item-key="id"
          ghost-class="opacity-40"
          drag-class="opacity-80"
          @change="(e: Record<string, unknown>) => onDragChange(e, collection.id, null, 'folders')"
        >
          <template #item="{ element: folder }: { element: Folder }">
            <FolderNode
              :folder="folder"
              :collection-id="collection.id"
              :expanded-ids="expanded"
              @toggle-expanded="toggleExpanded"
              @open-request="openRequest"
              @contextmenu="($event) => emit('contextmenu', $event)"
              @drag-change="(e, fid, lt) => onDragChange(e, collection.id, fid, lt)"
            />
          </template>
        </draggable>

        <!-- ── Root-level requests (draggable) ─────────────────────────── -->
        <draggable
          :list="collection.requests"
          :group="{ name: 'requests-' + collection.id }"
          item-key="id"
          ghost-class="opacity-40"
          drag-class="opacity-80"
          @change="(e: Record<string, unknown>) => onDragChange(e, collection.id, null, 'requests')"
        >
          <template #item="{ element: request }: { element: Request }">
            <RequestNode
              :request="request"
              :collection-id="collection.id"
              :is-active="isActiveRequest(request.id)"
              @open="openRequest(request)"
              @contextmenu="(action, e) => emitContextmenu('request', action, request.id, collection.id, request.name, e)"
            />
          </template>
        </draggable>
      </div>
    </div>

    <!-- Empty state -->
    <p
      v-if="collectionsStore.collections.length === 0"
      class="py-6 text-center text-xs text-dark-muted"
    >
      No collections yet.
    </p>
  </div>
</template>

<!--
  ─── Sub-components ──────────────────────────────────────────────────────────
  Defined as script-less sub-templates in the same file to keep the tree
  self-contained. Vue 3 allows multiple components per file via defineOptions
  but we keep things simpler with recursive-capable inline components.
-->

<script lang="ts">
/**
 * FolderNode — renders a single Folder and its children recursively.
 * Uses defineComponent for recursive self-reference support.
 */
import { defineComponent, h, ref, resolveComponent } from 'vue'
import draggableCmp from 'vuedraggable'

export const FolderNode = defineComponent({
  name: 'FolderNode',

  props: {
    folder:       { type: Object as () => Folder,      required: true },
    collectionId: { type: String,                       required: true },
    expandedIds:  { type: Object as () => Set<string>, required: true },
  },

  emits: ['toggleExpanded', 'openRequest', 'contextmenu', 'dragChange'],

  setup(props, { emit }) {
    const isExpanded = () => props.expandedIds.has(props.folder.id)

    function toggle() {
      emit('toggleExpanded', props.folder.id)
    }

    function handleDragChange(
      rawEvent: Record<string, unknown>,
      folderId: string,
      listType: 'requests' | 'folders',
    ) {
      emit('dragChange', rawEvent, folderId, listType)
    }

    const METHOD_COLORS: Record<string, string> = {
      GET:    'text-method-get',
      POST:   'text-method-post',
      PUT:    'text-method-put',
      PATCH:  'text-method-patch',
      DELETE: 'text-method-delete',
    }

    return { isExpanded, toggle, handleDragChange, METHOD_COLORS }
  },

  render() {
    const { folder, collectionId, expandedIds } = this.$props
    const emit = this.$emit
    const expanded = expandedIds.has(folder.id)

    const chevron = h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        class: ['h-3.5 w-3.5 shrink-0 transition-transform duration-150', expanded ? 'rotate-90' : ''],
        viewBox: '0 0 20 20',
        fill: 'currentColor',
        'aria-hidden': 'true',
      },
      [
        h('path', {
          'fill-rule': 'evenodd',
          d: 'M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z',
          'clip-rule': 'evenodd',
        }),
      ],
    )

    const folderIcon = h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        class: 'h-4 w-4 shrink-0 text-warning/70',
        viewBox: '0 0 20 20',
        fill: 'currentColor',
        'aria-hidden': 'true',
      },
      [h('path', { d: 'M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z' })],
    )

    const renameBtn = h(
      'button',
      {
        type: 'button',
        class: 'rounded p-0.5 text-text-secondary hover:text-text-primary hover:bg-dark-active transition-colors',
        title: 'Rename folder',
        onClick: (e: MouseEvent) => {
          e.stopPropagation()
          emit('contextmenu', { type: 'folder', action: 'rename', id: folder.id, collectionId, name: folder.name })
        },
      },
      [
        h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-3.5 w-3.5', viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': 'true' }, [
          h('path', { d: 'M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z' }),
        ]),
      ],
    )

    const deleteBtn = h(
      'button',
      {
        type: 'button',
        class: 'rounded p-0.5 text-text-secondary hover:text-danger hover:bg-dark-active transition-colors',
        title: 'Delete folder',
        onClick: (e: MouseEvent) => {
          e.stopPropagation()
          emit('contextmenu', { type: 'folder', action: 'delete', id: folder.id, collectionId, name: folder.name })
        },
      },
      [
        h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-3.5 w-3.5', viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': 'true' }, [
          h('path', {
            'fill-rule': 'evenodd',
            d: 'M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z',
            'clip-rule': 'evenodd',
          }),
        ]),
      ],
    )

    const header = h(
      'div',
      {
        class: [
          'group flex items-center gap-1 rounded px-1 py-1 cursor-pointer',
          'text-text-secondary hover:bg-dark-hover hover:text-text-primary transition-colors',
          expanded ? 'text-text-primary' : '',
        ],
        onClick: () => this.toggle(),
      },
      [
        chevron,
        folderIcon,
        h('span', { class: 'flex-1 truncate text-sm leading-none' }, folder.name),
        h('div', { class: 'hidden group-hover:flex items-center gap-0.5 shrink-0', onClick: (e: MouseEvent) => e.stopPropagation() }, [renameBtn, deleteBtn]),
      ],
    )

    if (!expanded) return h('div', { class: 'select-none' }, [header])

    // Sub-folders draggable
    const FolderNodeResolved = resolveComponent('FolderNode')
    const subFolders = h(draggableCmp, {
      list: folder.folders,
      group: { name: 'folders-' + folder.id },
      itemKey: 'id',
      ghostClass: 'opacity-40',
      dragClass: 'opacity-80',
      onChange: (e: Record<string, unknown>) => this.handleDragChange(e, folder.id, 'folders'),
    }, {
      item: ({ element: subFolder }: { element: Folder }) =>
        h(FolderNodeResolved, {
          folder: subFolder,
          collectionId,
          expandedIds,
          onToggleExpanded: (id: string) => emit('toggleExpanded', id),
          onOpenRequest: (req: Request) => emit('openRequest', req),
          onContextmenu: (payload: unknown) => emit('contextmenu', payload),
          onDragChange: (e: Record<string, unknown>, fid: string, lt: 'requests' | 'folders') => emit('dragChange', e, fid, lt),
        }),
    })

    // Sub-requests draggable
    const RequestNodeResolved = resolveComponent('RequestNode')
    const subRequests = h(draggableCmp, {
      list: folder.requests,
      group: { name: 'requests-' + folder.id },
      itemKey: 'id',
      ghostClass: 'opacity-40',
      dragClass: 'opacity-80',
      onChange: (e: Record<string, unknown>) => this.handleDragChange(e, folder.id, 'requests'),
    }, {
      item: ({ element: req }: { element: Request }) => {
        const uiStore = useUiStore()
        return h(RequestNodeResolved, {
          request: req,
          collectionId,
          isActive: uiStore.activeRequestId === req.id,
          onOpen: () => emit('openRequest', req),
          onContextmenu: (action: 'rename' | 'delete', e: MouseEvent) => {
            e.preventDefault()
            emit('contextmenu', { type: 'request', action, id: req.id, collectionId, name: req.name })
          },
        })
      },
    })

    const children = h('div', { class: 'ml-3 border-l border-dark-border pl-1.5' }, [subFolders, subRequests])
    return h('div', { class: 'select-none' }, [header, children])
  },
})

/**
 * RequestNode — renders a single Request leaf item.
 */
export const RequestNode = defineComponent({
  name: 'RequestNode',

  props: {
    request:      { type: Object as () => Request, required: true },
    collectionId: { type: String,                  required: true },
    isActive:     { type: Boolean,                 default: false },
  },

  emits: ['open', 'contextmenu'],

  setup(props, { emit }) {
    const METHOD_COLORS: Record<string, string> = {
      GET:    'text-method-get',
      POST:   'text-method-post',
      PUT:    'text-method-put',
      PATCH:  'text-method-patch',
      DELETE: 'text-method-delete',
    }
    function methodColor(method: string): string {
      return METHOD_COLORS[method.toUpperCase()] ?? 'text-text-secondary'
    }

    return { methodColor }
  },

  render() {
    const { request, isActive } = this.$props
    const emit = this.$emit

    const renameBtn = h('button', {
      type: 'button',
      class: 'rounded p-0.5 text-text-secondary hover:text-text-primary hover:bg-dark-active transition-colors',
      title: 'Rename request',
      onClick: (e: MouseEvent) => { e.stopPropagation(); emit('contextmenu', 'rename', e) },
    }, [
      h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-3 w-3', viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': 'true' }, [
        h('path', { d: 'M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z' }),
      ]),
    ])

    const deleteBtn = h('button', {
      type: 'button',
      class: 'rounded p-0.5 text-text-secondary hover:text-danger hover:bg-dark-active transition-colors',
      title: 'Delete request',
      onClick: (e: MouseEvent) => { e.stopPropagation(); emit('contextmenu', 'delete', e) },
    }, [
      h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-3 w-3', viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': 'true' }, [
        h('path', {
          'fill-rule': 'evenodd',
          d: 'M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z',
          'clip-rule': 'evenodd',
        }),
      ]),
    ])

    return h(
      'div',
      {
        class: [
          'group flex items-center gap-1.5 rounded px-1 py-1 cursor-pointer select-none',
          'transition-colors',
          isActive
            ? 'bg-dark-active text-text-primary'
            : 'text-text-secondary hover:bg-dark-hover hover:text-text-primary',
        ],
        onClick: () => emit('open'),
      },
      [
        // Method badge
        h('span', {
          class: ['text-[10px] font-mono font-bold shrink-0 w-[38px] text-right', this.methodColor(request.method)],
          'aria-label': `HTTP method: ${request.method}`,
        }, request.method),
        // Request name
        h('span', { class: 'flex-1 truncate text-sm leading-none' }, request.name || request.url || 'Untitled'),
        // Action buttons
        h('div', {
          class: 'hidden group-hover:flex items-center gap-0.5 shrink-0',
          onClick: (e: MouseEvent) => e.stopPropagation(),
        }, [renameBtn, deleteBtn]),
      ],
    )
  },
})
</script>
