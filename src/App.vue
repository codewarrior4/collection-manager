<script setup lang="ts">
/**
 * App.vue — root layout wiring.
 *
 * Composes AppTopbar, AppSidebar, RequestBuilder, ResponseViewer, all three
 * modals (via Teleport), and the Notification banner.
 *
 * On mount, initialises both stores in parallel and blocks the sidebar from
 * rendering until both resolves.
 *
 * Requirements: 8.3, 9.1, 9.2
 */
import { ref, onMounted } from 'vue'
import { useCollectionsStore } from '@/stores/collections'
import { useEnvironmentsStore } from '@/stores/environments'
import { useUiStore } from '@/stores/ui'

import AppTopbar from '@/components/shell/AppTopbar.vue'
import AppSidebar from '@/components/shell/AppSidebar.vue'
import RequestBuilder from '@/components/request/RequestBuilder.vue'
import ResponseViewer from '@/components/response/ResponseViewer.vue'
import EnvironmentsModal from '@/components/modals/EnvironmentsModal.vue'
import CodeGeneratorModal from '@/components/modals/CodeGeneratorModal.vue'
import ImportExportModal from '@/components/modals/ImportExportModal.vue'
import Notification from '@/components/shared/Notification.vue'

// ─── Stores ───────────────────────────────────────────────────────────────────

const collectionsStore = useCollectionsStore()
const environmentsStore = useEnvironmentsStore()
const uiStore = useUiStore()

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Block sidebar rendering until both stores finish loading from IndexedDB.
 * Uses a single flag rather than two separate ones so the sidebar mounts
 * in a single tick once both promises resolve.
 */
const initialized = ref(false)

onMounted(async () => {
  try {
    await Promise.all([
      collectionsStore.init(),
      environmentsStore.init(),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load data from storage.'
    uiStore.showError(msg)
  } finally {
    initialized.value = true
  }
})
</script>

<template>
  <!-- Root container: full viewport height, vertical flex column -->
  <div class="h-screen flex flex-col bg-dark-surface text-text-primary overflow-hidden">

    <!-- ── Topbar ──────────────────────────────────────────────────────────── -->
    <AppTopbar />

    <!-- ── Below topbar: sidebar + main content ───────────────────────────── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ── Sidebar (blocked until stores are initialised) ─────────────── -->
      <template v-if="initialized">
        <AppSidebar />
      </template>

      <!-- Sidebar skeleton while loading -->
      <aside
        v-else
        class="flex flex-col w-64 shrink-0 bg-dark-card border-r border-dark-border"
        aria-label="Loading collections…"
        aria-busy="true"
      >
        <div class="flex items-center gap-2 px-3 py-2 border-b border-dark-border">
          <span class="flex-1 text-xs font-semibold uppercase tracking-wide text-text-secondary select-none">
            Collections
          </span>
        </div>
        <!-- Skeleton rows -->
        <div class="flex-1 p-2 flex flex-col gap-2">
          <div
            v-for="i in 4"
            :key="i"
            class="h-7 rounded bg-dark-elevated animate-pulse"
          />
        </div>
      </aside>

      <!-- ── Main content area ───────────────────────────────────────────── -->
      <main class="flex-1 flex flex-col overflow-hidden" aria-label="Request workspace">

        <template v-if="uiStore.activeRequestId">
          <!-- Request builder (top) + response viewer (bottom) split -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <!-- Request builder takes up ~55% of the space -->
            <div class="flex-[55] min-h-0 border-b border-dark-border overflow-hidden">
              <RequestBuilder />
            </div>
            <!-- Response viewer takes up ~45% -->
            <div class="flex-[45] min-h-0 overflow-hidden">
              <ResponseViewer />
            </div>
          </div>
        </template>

        <!-- Idle placeholder when no request is selected -->
        <template v-else>
          <div
            class="flex-1 flex flex-col items-center justify-center gap-4 select-none"
            aria-label="No request selected"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-16 w-16 text-dark-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0
                   00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2
                   2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            <div class="text-center">
              <p class="text-base font-medium text-text-secondary">
                Select a request to get started
              </p>
              <p class="mt-1 text-sm text-dark-muted">
                Pick an existing request from the sidebar, or create a new collection.
              </p>
            </div>
          </div>
        </template>

      </main>
    </div>

    <!-- ── Modals via Teleport ─────────────────────────────────────────────── -->

    <!-- Environments modal -->
    <Teleport to="body">
      <EnvironmentsModal v-if="uiStore.openModal === 'environments'" />
    </Teleport>

    <!-- Code Generator modal -->
    <Teleport to="body">
      <CodeGeneratorModal v-if="uiStore.openModal === 'codeGenerator'" />
    </Teleport>

    <!-- Import / Export modal -->
    <Teleport to="body">
      <ImportExportModal v-if="uiStore.openModal === 'importExport'" />
    </Teleport>

    <!-- ── Error notification ──────────────────────────────────────────────── -->
    <!-- Notification already uses its own internal Teleport to body -->
    <Notification v-if="uiStore.errorMessage !== null" />

  </div>
</template>
