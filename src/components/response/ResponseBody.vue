<script setup lang="ts">
/**
 * ResponseBody — renders the body portion of the last HTTP response.
 *
 * - Reads `uiStore.lastResponse.body`.
 * - When body is valid JSON, renders a collapsible `<JsonTree>` tree.
 * - When body is not valid JSON (or empty), renders raw text in a `<pre>`.
 * - Provides a copy button that writes the raw body to the system clipboard.
 *   Shows a "Could not copy" error toast on clipboard failure (req 3.6 / design error table).
 *
 * Requirements: 3.3, 3.4, 3.6
 */
import { computed, ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import JsonTree from '@/components/shared/JsonTree.vue'

// ─── Store ────────────────────────────────────────────────────────────────────

const uiStore = useUiStore()

// ─── JSON parsing ─────────────────────────────────────────────────────────────

/**
 * Attempt to parse the response body as JSON.
 * Returns the parsed value on success, or `null` when the body is absent,
 * empty, or not valid JSON.
 */
const parsedBody = computed<unknown>(() => {
  const body = uiStore.lastResponse?.body
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
})

/** True when the response body is present and parses as valid JSON. */
const isJson = computed<boolean>(() => {
  const body = uiStore.lastResponse?.body
  return Boolean(body) && parsedBody.value !== null
})

// ─── Copy-to-clipboard ───────────────────────────────────────────────────────

/** Transient per-copy feedback state. */
type CopyState = 'idle' | 'copied' | 'error'
const copyState = ref<CopyState>('idle')
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

async function copyBody(): Promise<void> {
  const body = uiStore.lastResponse?.body ?? ''

  // Clear any in-flight reset timer so the UI doesn't flicker.
  if (copyResetTimer !== null) {
    clearTimeout(copyResetTimer)
    copyResetTimer = null
  }

  try {
    await navigator.clipboard.writeText(body)
    copyState.value = 'copied'
  } catch {
    copyState.value = 'error'
    // Surface the error through the global error store so Notification.vue
    // can display it (design error-handling table: "Could not copy to clipboard").
    uiStore.showError('Could not copy to clipboard')
  }

  // Reset the button label after 2 s regardless of outcome.
  copyResetTimer = setTimeout(() => {
    copyState.value = 'idle'
    copyResetTimer = null
  }, 2_000)
}
</script>

<template>
  <!-- ── Empty / no-response state ─────────────────────────────────────────── -->
  <div
    v-if="!uiStore.lastResponse"
    class="flex items-center justify-center h-full text-sm text-dark-muted select-none py-8"
    aria-label="No response yet"
  >
    Send a request to see the response body here.
  </div>

  <!-- ── Response body panel ────────────────────────────────────────────────── -->
  <div
    v-else
    class="flex flex-col h-full overflow-hidden"
    aria-label="Response body"
  >
    <!-- Toolbar: copy button + content-type hint -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-dark-border shrink-0">
      <!-- Content-type badge -->
      <span
        class="text-xs font-mono text-text-secondary"
        aria-label="Body format"
      >
        {{ isJson ? 'JSON' : 'Text' }}
      </span>

      <!-- Copy button (req 3.6) -->
      <button
        type="button"
        :disabled="!uiStore.lastResponse.body"
        class="flex items-center gap-1.5 h-7 rounded px-2.5 text-xs font-medium
               border border-dark-border bg-dark-elevated text-text-secondary
               hover:text-text-primary hover:border-dark-dim
               disabled:opacity-40 disabled:cursor-not-allowed
               focus:outline-none focus:ring-1 focus:ring-primary
               transition-colors"
        :aria-label="copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Could not copy' : 'Copy body'"
        @click="copyBody"
      >
        <!-- Clipboard icon (idle / error) -->
        <svg
          v-if="copyState !== 'copied'"
          xmlns="http://www.w3.org/2000/svg"
          class="h-3.5 w-3.5"
          :class="copyState === 'error' ? 'text-danger' : ''"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
          <path
            d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2
               3 3 0 01-3 3H9a3 3 0 01-3-3z"
          />
        </svg>

        <!-- Check icon (copied) -->
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          class="h-3.5 w-3.5 text-success"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clip-rule="evenodd"
          />
        </svg>

        <span :class="copyState === 'error' ? 'text-danger' : copyState === 'copied' ? 'text-success' : ''">
          {{ copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Could not copy' : 'Copy' }}
        </span>
      </button>
    </div>

    <!-- Body content area -->
    <div class="flex-1 overflow-auto p-4">
      <!-- JSON tree (req 3.3) -->
      <JsonTree
        v-if="isJson"
        :data="parsedBody"
        :depth="0"
        aria-label="JSON response body"
      />

      <!-- Plain text (req 3.4) -->
      <pre
        v-else
        class="text-sm font-mono text-text-primary whitespace-pre-wrap break-words"
        aria-label="Plain text response body"
      >{{ uiStore.lastResponse.body || '(empty body)' }}</pre>
    </div>
  </div>
</template>
