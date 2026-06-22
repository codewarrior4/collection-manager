<script setup lang="ts">
/**
 * ResponseViewer — composes ResponseBody and ResponseHeaders tabs and displays
 * the top-level response metadata (status code, status text, response time).
 *
 * - Displays HTTP status code + status text (req 3.1)
 * - Displays total response time in ms (req 3.2)
 * - Shows a loading spinner while `uiStore.loading` is true (req 3.8)
 * - Shows a descriptive error message when `status === 0` (req 3.7)
 * - Tabs: Body (→ ResponseBody) | Headers (→ ResponseHeaders)
 *
 * Requirements: 3.1, 3.2, 3.7, 3.8
 */
import { ref, computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import ResponseBody from '@/components/response/ResponseBody.vue'
import ResponseHeaders from '@/components/response/ResponseHeaders.vue'

// ─── Store ────────────────────────────────────────────────────────────────────

const uiStore = useUiStore()

// ─── Tab state ────────────────────────────────────────────────────────────────

type TabId = 'body' | 'headers'

const TABS: { id: TabId; label: string }[] = [
  { id: 'body',    label: 'Body'    },
  { id: 'headers', label: 'Headers' },
]

const activeTab = ref<TabId>('body')

// ─── Status-code colour ───────────────────────────────────────────────────────

/**
 * Returns a Tailwind colour class for the HTTP status code:
 *   2xx → success (green)
 *   3xx → info (blue)
 *   4xx → warning (amber)
 *   5xx → danger (red)
 *   0   → danger (network error)
 */
const statusColour = computed<string>(() => {
  const status = uiStore.lastResponse?.status ?? 0
  if (status === 0)            return 'text-danger'
  if (status >= 200 && status < 300) return 'text-success'
  if (status >= 300 && status < 400) return 'text-info'
  if (status >= 400 && status < 500) return 'text-warning'
  return 'text-danger'
})

/** True when the response represents a network-level failure. */
const isNetworkError = computed<boolean>(() =>
  uiStore.lastResponse !== null && uiStore.lastResponse.status === 0,
)
</script>

<template>
  <div
    class="flex flex-col h-full overflow-hidden bg-dark-surface"
    aria-label="Response viewer"
  >
    <!-- ─────────────────────────────────────────────────────────────────────
         Loading overlay  (req 3.8)
    ──────────────────────────────────────────────────────────────────────── -->
    <div
      v-if="uiStore.loading"
      class="flex flex-col items-center justify-center h-full gap-3 text-center select-none"
      aria-live="polite"
      aria-busy="true"
      aria-label="Sending request…"
    >
      <!-- Spinner -->
      <svg
        class="h-8 w-8 animate-spin text-primary"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-sm text-text-secondary">Sending request…</p>
    </div>

    <!-- ─────────────────────────────────────────────────────────────────────
         No-response idle state
    ──────────────────────────────────────────────────────────────────────── -->
    <div
      v-else-if="!uiStore.lastResponse"
      class="flex flex-col items-center justify-center h-full gap-3 text-center select-none"
      aria-label="No response yet"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-10 w-10 text-dark-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
             01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p class="text-sm text-text-secondary">Hit <strong class="text-text-primary">Send</strong> to see the response here.</p>
    </div>

    <!-- ─────────────────────────────────────────────────────────────────────
         Response panel
    ──────────────────────────────────────────────────────────────────────── -->
    <template v-else>
      <!-- ── Status bar ───────────────────────────────────────────────────── -->
      <div
        class="flex items-center gap-3 px-4 py-2.5 border-b border-dark-border shrink-0
               bg-dark-card"
        aria-label="Response metadata"
      >
        <!-- Network error banner (req 3.7) -->
        <template v-if="isNetworkError">
          <span
            class="flex items-center gap-1.5 text-sm font-medium text-danger"
            role="alert"
            aria-live="polite"
          >
            <!-- Error icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0
                   1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0
                   00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            Network Error
          </span>

          <!-- Error body preview (first 120 chars) -->
          <span class="text-xs text-text-secondary truncate max-w-xs">
            {{ uiStore.lastResponse.body || 'Request failed — check the URL and network connection.' }}
          </span>
        </template>

        <!-- Normal status code + text (req 3.1) -->
        <template v-else>
          <!-- Status code badge -->
          <span
            :class="['font-mono text-sm font-semibold', statusColour]"
            aria-label="`HTTP status ${uiStore.lastResponse.status}`"
          >
            {{ uiStore.lastResponse.status }}
          </span>

          <!-- Status text -->
          <span class="text-sm text-text-secondary truncate">
            {{ uiStore.lastResponse.statusText }}
          </span>
        </template>

        <!-- Spacer -->
        <div class="flex-1" />

        <!-- Response time (req 3.2) -->
        <span
          class="text-xs font-mono text-text-secondary shrink-0"
          :title="`Response time: ${uiStore.lastResponse.timeMs} ms`"
          aria-label="`Response time ${uiStore.lastResponse.timeMs} milliseconds`"
        >
          {{ uiStore.lastResponse.timeMs }} ms
        </span>
      </div>

      <!-- ── Tab bar ───────────────────────────────────────────────────────── -->
      <div
        class="flex items-center gap-0.5 px-4 border-b border-dark-border shrink-0 bg-dark-card"
        role="tablist"
        aria-label="Response sections"
      >
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`response-tab-panel-${tab.id}`"
          :tabindex="activeTab === tab.id ? 0 : -1"
          class="relative px-3 py-2.5 text-xs font-medium transition-colors
                 focus:outline-none focus:ring-1 focus:ring-primary rounded-t"
          :class="activeTab === tab.id
            ? 'text-text-primary after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-primary'
            : 'text-text-secondary hover:text-text-primary'"
          @click="activeTab = tab.id"
        >
          <!-- Badge showing header count on the Headers tab -->
          <span class="flex items-center gap-1.5">
            {{ tab.label }}
            <span
              v-if="tab.id === 'headers' && uiStore.lastResponse"
              class="rounded-full bg-dark-elevated px-1.5 py-0.5 text-[10px]
                     font-semibold text-text-secondary tabular-nums"
            >
              {{ Object.keys(uiStore.lastResponse.headers).length }}
            </span>
          </span>
        </button>
      </div>

      <!-- ── Tab panels ────────────────────────────────────────────────────── -->
      <div class="flex-1 overflow-hidden">
        <!-- Body tab -->
        <div
          v-show="activeTab === 'body'"
          id="response-tab-panel-body"
          role="tabpanel"
          aria-label="Response body"
          class="h-full overflow-auto"
        >
          <ResponseBody />
        </div>

        <!-- Headers tab -->
        <div
          v-show="activeTab === 'headers'"
          id="response-tab-panel-headers"
          role="tabpanel"
          aria-label="Response headers"
          class="h-full overflow-auto"
        >
          <ResponseHeaders />
        </div>
      </div>
    </template>
  </div>
</template>
