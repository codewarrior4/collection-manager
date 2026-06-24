<script setup lang="ts">
/**
 * CodeGeneratorModal — generate and copy code snippets for the active request.
 *
 * Features:
 *   - Language tabs: cURL, PHP cURL, Laravel, JS Fetch, Axios (req 7.1).
 *   - Tab change regenerates snippet via generateSnippet() (req 7.6).
 *   - Read-only MonacoEditor with language-appropriate syntax highlighting (req 7.4).
 *   - Copy button writes snippet to clipboard (req 7.5).
 *   - "Could not copy" toast on clipboard failure (req 7.5).
 *   - Placeholder when no active request is set.
 *   - Modal shown when uiStore.openModal === 'codeGenerator'.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
import { ref, computed, watch } from 'vue'
import { useCollectionsStore } from '@/stores/collections'
import { useEnvironmentsStore } from '@/stores/environments'
import { useUiStore } from '@/stores/ui'
import { generateSnippet } from '@/services/codeGenerator'
import MonacoEditor from '@/components/shared/MonacoEditor.vue'
import type { CodeTarget } from '@/types'
import type { Request, Folder, Collection } from '@/types'

// ─── Stores ──────────────────────────────────────────────────────────────────

const collectionsStore = useCollectionsStore()
const environmentsStore = useEnvironmentsStore()
const uiStore = useUiStore()

// ─── Modal visibility ─────────────────────────────────────────────────────────

const isOpen = computed(() => uiStore.openModal === 'codeGenerator')

// ─── Active request lookup ────────────────────────────────────────────────────

function findRequestInFolder(folder: Folder, id: string): Request | null {
  for (const req of folder.requests) {
    if (req.id === id) return req
  }
  for (const sub of folder.folders) {
    const found = findRequestInFolder(sub, id)
    if (found) return found
  }
  return null
}

function findRequestAnywhere(collection: Collection, id: string): Request | null {
  for (const req of collection.requests) {
    if (req.id === id) return req
  }
  for (const folder of collection.folders) {
    const found = findRequestInFolder(folder, id)
    if (found) return found
  }
  return null
}

const activeRequest = computed<Request | null>(() => {
  const id = uiStore.activeRequestId
  if (!id) return null
  for (const col of collectionsStore.collections) {
    const found = findRequestAnywhere(col, id)
    if (found) return found
  }
  return null
})

// ─── Tabs ─────────────────────────────────────────────────────────────────────

interface Tab {
  label: string
  target: CodeTarget
  language: 'shell' | 'php' | 'javascript'
}

const TABS: Tab[] = [
  { label: 'cURL', target: 'curl', language: 'shell' },
  { label: 'PHP cURL', target: 'php-curl', language: 'php' },
  { label: 'Laravel', target: 'laravel', language: 'php' },
  { label: 'JS Fetch', target: 'js-fetch', language: 'javascript' },
  { label: 'Axios', target: 'axios', language: 'javascript' },
]

const activeTabIndex = ref(0)
const activeTab = computed(() => TABS[activeTabIndex.value])

// Reset tab when modal opens
watch(isOpen, (open) => {
  if (open) activeTabIndex.value = 0
})

// ─── Snippet generation ───────────────────────────────────────────────────────

const snippet = computed<string>(() => {
  if (!activeRequest.value) return ''
  return generateSnippet(
    activeRequest.value,
    environmentsStore.activeEnvironment,
    activeTab.value.target,
  )
})

// ─── Copy to clipboard ────────────────────────────────────────────────────────

const copyState = ref<'idle' | 'copied' | 'error'>('idle')
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function copySnippet(): Promise<void> {
  if (!snippet.value) return
  try {
    await navigator.clipboard.writeText(snippet.value)
    copyState.value = 'copied'
  } catch {
    copyState.value = 'error'
  }
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyState.value = 'idle'
  }, 2000)
}

// ─── Close modal ──────────────────────────────────────────────────────────────

function close(): void {
  uiStore.closeModal()
}
</script>

<template>
  <!-- Full-screen backdrop -->
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-label="Code Generator"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      aria-hidden="true"
      @click="close"
    />

    <!-- Dialog panel -->
    <div
      class="relative z-10 flex flex-col w-full max-w-3xl max-h-[85vh] rounded-xl
             bg-dark-card border border-dark-border shadow-2xl overflow-hidden"
    >
      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-dark-border shrink-0">
        <h2 class="text-base font-semibold text-text-primary">Code Generator</h2>
        <div class="flex items-center gap-2">
          <!-- Copy button -->
          <button
            v-if="activeRequest"
            type="button"
            class="h-8 rounded px-3 text-xs font-medium transition-colors"
            :class="
              copyState === 'copied'
                ? 'bg-success/15 text-success border border-success/30'
                : copyState === 'error'
                ? 'bg-error/15 text-error border border-error/30'
                : 'bg-dark-elevated text-text-secondary border border-dark-border hover:text-text-primary hover:bg-dark-hover'
            "
            :aria-label="copyState === 'copied' ? 'Copied!' : 'Copy snippet'"
            @click="copySnippet"
          >
            {{
              copyState === 'copied'
                ? 'Copied!'
                : copyState === 'error'
                ? 'Could not copy'
                : 'Copy'
            }}
          </button>

          <!-- Close button -->
          <button
            type="button"
            class="flex items-center justify-center h-8 w-8 rounded
                   text-text-secondary hover:text-text-primary hover:bg-dark-hover
                   focus:outline-none focus:ring-1 focus:ring-primary
                   transition-colors"
            aria-label="Close code generator"
            @click="close"
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
                   111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10
                   11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0
                   010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- ── No active request placeholder ─────────────────────────────── -->
      <div
        v-if="!activeRequest"
        class="flex-1 flex items-center justify-center p-8"
        aria-label="No active request"
      >
        <div class="text-center">
          <p class="text-sm text-text-secondary mb-1">No request selected</p>
          <p class="text-xs text-dark-muted">
            Open a request from the sidebar to generate a code snippet.
          </p>
        </div>
      </div>

      <!-- ── Content area ───────────────────────────────────────────────── -->
      <template v-else>
        <!-- Language tabs -->
        <div
          class="flex gap-0 border-b border-dark-border shrink-0 px-5"
          role="tablist"
          aria-label="Target language"
        >
          <button
            v-for="(tab, index) in TABS"
            :key="tab.target"
            type="button"
            role="tab"
            :aria-selected="activeTabIndex === index"
            :aria-controls="`snippet-panel-${tab.target}`"
            class="h-10 px-4 text-xs font-medium border-b-2 transition-colors"
            :class="
              activeTabIndex === index
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-dark-dim'
            "
            @click="activeTabIndex = index"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Monaco editor -->
        <div
          :id="`snippet-panel-${activeTab.target}`"
          class="flex-1 overflow-hidden"
          style="min-height: 0"
          role="tabpanel"
          :aria-label="`${activeTab.label} snippet`"
        >
          <MonacoEditor
            :model-value="snippet"
            :language="activeTab.language"
            :read-only="true"
          />
        </div>
      </template>
    </div>
  </div>
</template>
