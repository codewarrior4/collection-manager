<script setup lang="ts">
/**
 * RequestBuilder — the main request editing panel.
 *
 * Reads the active request from uiStore.activeRequestId, deep-clones it into
 * a local `draftRequest` ref, tracks dirty state, and provides Send / Save
 * buttons. Also renders a tab bar for Params / Headers / Body / Auth (tab
 * content components are implemented in tasks 13.2–13.6; placeholders used here).
 *
 * Requirements: 2.1, 2.2, 2.12, 2.13, 9.3, 9.4, 9.5
 */
import { ref, computed, watch } from 'vue'
import type { Request, HttpMethod } from '@/types'
import { useUiStore } from '@/stores/ui'
import { useCollectionsStore } from '@/stores/collections'
import { useEnvironmentsStore } from '@/stores/environments'
import { sendRequest } from '@/services/httpClient'
import AuthTab from '@/components/request/AuthTab.vue'

// ─── Stores ───────────────────────────────────────────────────────────────────

const uiStore = useUiStore()
const collectionsStore = useCollectionsStore()
const environmentsStore = useEnvironmentsStore()

// ─── HTTP method colours ──────────────────────────────────────────────────────

const METHOD_COLOURS: Record<HttpMethod, string> = {
  GET:    'text-method-get',
  POST:   'text-method-post',
  PUT:    'text-method-put',
  PATCH:  'text-method-patch',
  DELETE: 'text-method-delete',
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

// ─── Active-request lookup ────────────────────────────────────────────────────

/** Find a request by id across all collections (root + nested folders). */
function findRequestById(id: string): Request | null {
  for (const col of collectionsStore.collections) {
    const found = searchInCollection(col as import('@/types').Collection, id)
    if (found) return found
  }
  return null
}

function searchInCollection(col: import('@/types').Collection, id: string): Request | null {
  for (const req of col.requests) {
    if (req.id === id) return req
  }
  for (const folder of col.folders) {
    const found = searchInFolder(folder, id)
    if (found) return found
  }
  return null
}

function searchInFolder(folder: import('@/types').Folder, id: string): Request | null {
  for (const req of folder.requests) {
    if (req.id === id) return req
  }
  for (const sub of folder.folders) {
    const found = searchInFolder(sub, id)
    if (found) return found
  }
  return null
}

// ─── Draft state ──────────────────────────────────────────────────────────────

/** A deep-clone of the stored request, edited locally. */
const draftRequest = ref<Request | null>(null)

/** A snapshot of the stored request at the time it was last loaded / saved. */
const savedSnapshot = ref<Request | null>(null)

/** Deep-clone a request via JSON round-trip. */
function cloneRequest(r: Request): Request {
  return JSON.parse(JSON.stringify(r))
}

// Watch the active request id and (re-)load the draft whenever it changes.
watch(
  () => uiStore.activeRequestId,
  (id) => {
    if (!id) {
      draftRequest.value = null
      savedSnapshot.value = null
      return
    }
    const stored = findRequestById(id)
    if (stored) {
      draftRequest.value = cloneRequest(stored)
      savedSnapshot.value = cloneRequest(stored)
    } else {
      draftRequest.value = null
      savedSnapshot.value = null
    }
  },
  { immediate: true },
)

// Also watch the collections store so that if an external save updates the
// stored request (e.g. after our own save) we refresh the snapshot.
watch(
  () => {
    if (!uiStore.activeRequestId) return null
    return findRequestById(uiStore.activeRequestId)
  },
  (stored) => {
    if (stored && draftRequest.value && stored.id === draftRequest.value.id) {
      // Only update the snapshot (not the draft) so the user's edits are preserved.
      savedSnapshot.value = cloneRequest(stored)
    }
  },
)

// ─── Dirty tracking ───────────────────────────────────────────────────────────

const isDirty = computed<boolean>(() => {
  if (!draftRequest.value || !savedSnapshot.value) return false
  return JSON.stringify(draftRequest.value) !== JSON.stringify(savedSnapshot.value)
})

watch(isDirty, (dirty) => {
  uiStore.setUnsaved(dirty)
})

// ─── Tab bar ─────────────────────────────────────────────────────────────────

type TabId = 'params' | 'headers' | 'body' | 'auth'

const TABS: { id: TabId; label: string }[] = [
  { id: 'params',  label: 'Params'  },
  { id: 'headers', label: 'Headers' },
  { id: 'body',    label: 'Body'    },
  { id: 'auth',    label: 'Auth'    },
]

const activeTab = ref<TabId>('params')

// ─── Variable highlighting ────────────────────────────────────────────────────

/** All variable keys that are currently enabled in the active environment. */
const resolvedKeys = computed<Set<string>>(() => {
  const vars = environmentsStore.activeEnvironment?.variables ?? []
  return new Set(vars.filter((v) => v.enabled).map((v) => v.key))
})

/**
 * Segments the URL string into literal text and `{{token}}` spans.
 * Each span carries a `resolved` flag so the template can colour it.
 */
interface UrlSegment {
  text: string
  isToken: boolean
  resolved: boolean
}

const urlSegments = computed<UrlSegment[]>(() => {
  const url = draftRequest.value?.url ?? ''
  if (!url) return []

  const segments: UrlSegment[] = []
  const regex = /\{\{([^}]+)\}\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(url)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: url.slice(lastIndex, match.index), isToken: false, resolved: false })
    }
    const tokenName = match[1]
    segments.push({
      text: match[0],
      isToken: true,
      resolved: resolvedKeys.value.has(tokenName),
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < url.length) {
    segments.push({ text: url.slice(lastIndex), isToken: false, resolved: false })
  }

  return segments
})

/** Whether the URL contains any `{{…}}` tokens (drives overlay visibility). */
const hasTokens = computed(() => urlSegments.value.some((s) => s.isToken))

// ─── Send logic ───────────────────────────────────────────────────────────────

async function onSend(): Promise<void> {
  if (!draftRequest.value) return
  uiStore.setLoading(true)
  try {
    const result = await sendRequest(
      draftRequest.value,
      environmentsStore.activeEnvironment,
    )
    uiStore.setResponse(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    uiStore.showError(msg)
  } finally {
    uiStore.setLoading(false)
  }
}

// ─── Save logic ───────────────────────────────────────────────────────────────

async function onSave(): Promise<void> {
  if (!draftRequest.value) return
  await collectionsStore.updateRequest(draftRequest.value)
  // After save, update our local snapshot so isDirty resets to false.
  savedSnapshot.value = cloneRequest(draftRequest.value)
}
</script>

<template>
  <!-- ── Empty state ────────────────────────────────────────────────────────── -->
  <div
    v-if="!draftRequest"
    class="flex flex-col items-center justify-center h-full gap-3 text-center select-none"
    aria-label="No request selected"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-12 w-12 text-dark-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
    <p class="text-sm text-text-secondary">Select a request to start editing</p>
  </div>

  <!-- ── Request builder panel ─────────────────────────────────────────────── -->
  <div
    v-else
    class="flex flex-col h-full overflow-hidden"
    aria-label="Request builder"
  >
    <!-- ── Request name header ──────────────────────────────────────────────── -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-dark-border shrink-0">
      <span class="flex-1 text-sm font-medium text-text-primary truncate">
        {{ draftRequest.name }}
      </span>
      <!-- Unsaved indicator dot (req 9.5) -->
      <span
        v-if="isDirty"
        class="inline-flex items-center gap-1.5 text-xs text-warning"
        title="Unsaved changes"
        aria-label="Unsaved changes"
      >
        <span class="h-2 w-2 rounded-full bg-warning inline-block" aria-hidden="true" />
        Unsaved
      </span>
    </div>

    <!-- ── URL bar ──────────────────────────────────────────────────────────── -->
    <div class="flex items-center gap-2 px-4 py-3 border-b border-dark-border shrink-0">

      <!-- Method selector (req 2.1) -->
      <div class="relative shrink-0">
        <!-- Chevron icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
        <select
          :value="draftRequest.method"
          :class="[
            'h-9 appearance-none rounded border border-dark-border bg-dark-elevated',
            'pl-2 pr-7 text-xs font-semibold font-mono uppercase',
            'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary',
            'transition-colors cursor-pointer',
            METHOD_COLOURS[draftRequest.method],
          ]"
          aria-label="HTTP method"
          @change="draftRequest!.method = ($event.target as HTMLSelectElement).value as HttpMethod"
        >
          <option
            v-for="method in HTTP_METHODS"
            :key="method"
            :value="method"
          >
            {{ method }}
          </option>
        </select>
      </div>

      <!-- URL field with {{variable}} overlay (req 2.2) -->
      <div class="relative flex-1">
        <!-- Visible text input -->
        <input
          :value="draftRequest.url"
          type="text"
          placeholder="https://api.example.com/endpoint"
          class="w-full h-9 rounded border border-dark-border bg-dark-elevated px-3
                 text-sm font-mono text-text-primary placeholder:text-dark-muted
                 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                 transition-colors"
          :class="{ 'text-transparent caret-text-primary': hasTokens }"
          aria-label="Request URL"
          @input="draftRequest!.url = ($event.target as HTMLInputElement).value"
        />

        <!-- Overlay that highlights {{tokens}} — sits on top of the input (pointer-events-none) -->
        <div
          v-if="hasTokens"
          class="absolute inset-0 flex items-center px-3 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <span
            class="text-sm font-mono whitespace-pre"
            style="letter-spacing: inherit;"
          >
            <template v-for="(seg, idx) in urlSegments" :key="idx">
              <span
                v-if="seg.isToken"
                :class="seg.resolved
                  ? 'text-success bg-success/10 rounded-sm'
                  : 'text-warning bg-warning/10 rounded-sm'"
              >{{ seg.text }}</span>
              <span v-else class="text-text-primary">{{ seg.text }}</span>
            </template>
          </span>
        </div>
      </div>

      <!-- Send button (req 2.12) -->
      <button
        type="button"
        :disabled="uiStore.loading"
        class="flex items-center gap-1.5 h-9 rounded px-4 text-sm font-semibold
               bg-primary text-text-inverse
               hover:bg-primaryHover
               disabled:opacity-50 disabled:cursor-not-allowed
               focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-dark-surface
               transition-colors shrink-0"
        aria-label="Send request"
        @click="onSend"
      >
        <svg
          v-if="uiStore.loading"
          class="h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {{ uiStore.loading ? 'Sending…' : 'Send' }}
      </button>

      <!-- Save button (req 2.13, 9.5) -->
      <button
        type="button"
        class="flex items-center gap-1.5 h-9 rounded px-3 text-sm font-medium
               border border-dark-border bg-dark-elevated text-text-secondary
               hover:text-text-primary hover:border-dark-dim
               focus:outline-none focus:ring-1 focus:ring-primary
               transition-colors shrink-0"
        :class="{ 'border-warning text-warning hover:text-warning': isDirty }"
        aria-label="Save request"
        @click="onSave"
      >
        <!-- Unsaved dot badge on Save button (req 9.5) -->
        <span
          v-if="isDirty"
          class="h-1.5 w-1.5 rounded-full bg-warning shrink-0"
          aria-hidden="true"
        />
        Save
      </button>
    </div>

    <!-- ── Tab bar ──────────────────────────────────────────────────────────── -->
    <div
      class="flex items-center gap-0.5 px-4 border-b border-dark-border shrink-0"
      role="tablist"
      aria-label="Request sections"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`tab-panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        class="relative px-3 py-2.5 text-xs font-medium transition-colors
               focus:outline-none focus:ring-1 focus:ring-primary rounded-t"
        :class="activeTab === tab.id
          ? 'text-text-primary after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-primary'
          : 'text-text-secondary hover:text-text-primary'"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ── Tab panels ───────────────────────────────────────────────────────── -->
    <div class="flex-1 overflow-y-auto">

      <!-- Params tab (task 13.2 will replace this placeholder) -->
      <div
        v-show="activeTab === 'params'"
        id="tab-panel-params"
        role="tabpanel"
        aria-label="Query parameters"
        class="p-4"
      >
        <p class="text-xs text-dark-muted">
          Params tab — implemented in task 13.2
        </p>
      </div>

      <!-- Headers tab (task 13.4 will replace this placeholder) -->
      <div
        v-show="activeTab === 'headers'"
        id="tab-panel-headers"
        role="tabpanel"
        aria-label="Request headers"
        class="p-4"
      >
        <p class="text-xs text-dark-muted">
          Headers tab — implemented in task 13.4
        </p>
      </div>

      <!-- Body tab (task 13.5 will replace this placeholder) -->
      <div
        v-show="activeTab === 'body'"
        id="tab-panel-body"
        role="tabpanel"
        aria-label="Request body"
        class="p-4"
      >
        <p class="text-xs text-dark-muted">
          Body tab — implemented in task 13.5
        </p>
      </div>

      <!-- Auth tab (task 13.6) -->
      <div
        v-show="activeTab === 'auth'"
        id="tab-panel-auth"
        role="tabpanel"
        aria-label="Authorization"
      >
        <AuthTab
          v-if="draftRequest"
          :model-value="draftRequest.auth"
          @update:model-value="draftRequest!.auth = $event"
        />
      </div>

    </div>
  </div>
</template>
