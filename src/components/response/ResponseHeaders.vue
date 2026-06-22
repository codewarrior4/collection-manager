<script setup lang="ts">
/**
 * ResponseHeaders — renders the response headers as a read-only key-value list.
 *
 * Reads `uiStore.lastResponse.headers` and displays each header name/value pair
 * in a two-column table. When no response is available an empty-state message
 * is shown instead.
 *
 * Requirements: 3.5
 */
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'

// ─── Store ────────────────────────────────────────────────────────────────────

const uiStore = useUiStore()

// ─── Derived header list ──────────────────────────────────────────────────────

interface HeaderRow {
  name: string
  value: string
}

const headerRows = computed<HeaderRow[]>(() => {
  const headers = uiStore.lastResponse?.headers
  if (!headers) return []
  return Object.entries(headers).map(([name, value]) => ({ name, value }))
})
</script>

<template>
  <!-- ── Empty / no-response state ─────────────────────────────────────────── -->
  <div
    v-if="!uiStore.lastResponse"
    class="flex items-center justify-center h-full text-sm text-dark-muted select-none py-8"
    aria-label="No response yet"
  >
    Send a request to see the response headers here.
  </div>

  <!-- ── Headers panel ─────────────────────────────────────────────────────── -->
  <div
    v-else
    class="flex flex-col h-full overflow-hidden"
    aria-label="Response headers"
  >
    <!-- Count badge -->
    <div class="flex items-center px-4 py-2 border-b border-dark-border shrink-0">
      <span class="text-xs text-text-secondary">
        {{ headerRows.length }} header{{ headerRows.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Table area -->
    <div class="flex-1 overflow-auto">
      <!-- No headers returned -->
      <p
        v-if="headerRows.length === 0"
        class="py-8 text-sm text-dark-muted text-center select-none"
      >
        No response headers.
      </p>

      <!-- Header rows table -->
      <table
        v-else
        class="w-full text-sm border-collapse"
        aria-label="Response header list"
      >
        <thead class="sr-only">
          <tr>
            <th scope="col">Header name</th>
            <th scope="col">Header value</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in headerRows"
            :key="index"
            class="border-b border-dark-border last:border-0
                   hover:bg-dark-hover transition-colors"
          >
            <!-- Header name -->
            <td
              class="px-4 py-2.5 font-mono text-xs text-info font-medium
                     w-[40%] align-top break-all"
            >
              {{ row.name }}
            </td>

            <!-- Header value -->
            <td
              class="px-4 py-2.5 font-mono text-xs text-text-primary
                     align-top break-all"
            >
              {{ row.value }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
