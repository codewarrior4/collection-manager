<script setup lang="ts">
/**
 * ImportExportModal — export collections to JSON and import from various formats.
 *
 * Export tab:
 *   - Lists all collections; clicking one serializes and downloads it as JSON.
 *
 * Import tab:
 *   - File input accepting .json, .yaml, .yml.
 *   - Detects format: Postman v2.1, OpenAPI/Swagger, or native.
 *   - Deduplicates collection names with " (N+1)" suffix.
 *   - Writes to idb + pushes to Pinia state.
 *   - Displays ImportError.message on failure; does not modify storage on error.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7
 */
import { ref, computed } from 'vue'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import {
  serializeCollection,
  deserializeCollection,
  importPostmanV21,
  importOpenApi,
  ImportError,
} from '@/services/importExport'
import { downloadFile } from '@/utils/download'
import { db } from '@/db'

// ─── Stores ──────────────────────────────────────────────────────────────────

const collectionsStore = useCollectionsStore()
const uiStore = useUiStore()

// ─── Modal visibility ─────────────────────────────────────────────────────────

const isOpen = computed(() => uiStore.openModal === 'importExport')

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'export' | 'import'
const activeTab = ref<Tab>('export')

// ─── Export ───────────────────────────────────────────────────────────────────

function exportCollection(collectionId: string): void {
  const collection = collectionsStore.collections.find((c) => c.id === collectionId)
  if (!collection) return
  const json = serializeCollection(collection)
  downloadFile(json, `${collection.name}.json`)
}

// ─── Import ───────────────────────────────────────────────────────────────────

const importError = ref<string | null>(null)
const importSuccess = ref<string | null>(null)
const isImporting = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

/**
 * Deduplicate a collection name against existing names.
 * If baseName already exists, tries baseName (2), (3), … until unique.
 */
function deduplicateName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) return baseName
  let n = 2
  while (existingNames.includes(`${baseName} (${n})`)) n++
  return `${baseName} (${n})`
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importError.value = null
  importSuccess.value = null
  isImporting.value = true

  try {
    const text = await file.text()

    // ── Format detection ──────────────────────────────────────────────────
    let parsed: unknown
    try {
      // Try JSON parse first for detection
      parsed = JSON.parse(text)
    } catch {
      parsed = null // may be YAML
    }

    let collection

    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'info' in (parsed as Record<string, unknown>) &&
      'item' in (parsed as Record<string, unknown>)
    ) {
      // Postman v2.1 format
      collection = importPostmanV21(text)
    } else if (
      // OpenAPI 3.x or Swagger 2.x — check JSON or YAML
      (parsed !== null &&
        typeof parsed === 'object' &&
        ('openapi' in (parsed as Record<string, unknown>) ||
          'swagger' in (parsed as Record<string, unknown>))) ||
      // YAML files — need to check the raw text for openapi/swagger key
      (parsed === null &&
        (text.includes('openapi:') || text.includes('swagger:')))
    ) {
      collection = importOpenApi(text)
    } else {
      // Native format
      collection = deserializeCollection(text)
    }

    // ── Name deduplication ────────────────────────────────────────────────
    const existingNames = collectionsStore.collections.map((c) => c.name)
    const uniqueName = deduplicateName(collection.name, existingNames)
    if (uniqueName !== collection.name) {
      collection = { ...collection, name: uniqueName }
    }

    // ── Persist to idb + Pinia state ──────────────────────────────────────
    const database = await db
    await database.put('collections', collection)
    collectionsStore.collections.push(collection)

    importSuccess.value = `Imported "${collection.name}" successfully.`
  } catch (err) {
    if (err instanceof ImportError) {
      importError.value = err.message
    } else if (err instanceof Error) {
      importError.value = err.message
    } else {
      importError.value = 'An unexpected error occurred during import.'
    }
  } finally {
    isImporting.value = false
    // Reset file input so the same file can be re-imported
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

// ─── Close modal ──────────────────────────────────────────────────────────────

function close(): void {
  uiStore.closeModal()
  importError.value = null
  importSuccess.value = null
}
</script>

<template>
  <!-- Full-screen backdrop -->
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-label="Import / Export"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      aria-hidden="true"
      @click="close"
    />

    <!-- Dialog panel -->
    <div
      class="relative z-10 flex flex-col w-full max-w-2xl max-h-[85vh] rounded-xl
             bg-dark-card border border-dark-border shadow-2xl overflow-hidden"
    >
      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-dark-border shrink-0">
        <h2 class="text-base font-semibold text-text-primary">Import / Export</h2>
        <button
          type="button"
          class="flex items-center justify-center h-8 w-8 rounded
                 text-text-secondary hover:text-text-primary hover:bg-dark-hover
                 focus:outline-none focus:ring-1 focus:ring-primary
                 transition-colors"
          aria-label="Close import/export modal"
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

      <!-- ── Tab bar ────────────────────────────────────────────────────── -->
      <div
        class="flex border-b border-dark-border shrink-0 px-5"
        role="tablist"
        aria-label="Import or export"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'export'"
          class="h-10 px-4 text-xs font-medium border-b-2 transition-colors"
          :class="
            activeTab === 'export'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary hover:border-dark-dim'
          "
          @click="activeTab = 'export'"
        >
          Export
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'import'"
          class="h-10 px-4 text-xs font-medium border-b-2 transition-colors"
          :class="
            activeTab === 'import'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary hover:border-dark-dim'
          "
          @click="activeTab = 'import'"
        >
          Import
        </button>
      </div>

      <!-- ── Tab content ────────────────────────────────────────────────── -->
      <div class="flex-1 overflow-y-auto">

        <!-- Export tab -->
        <div
          v-if="activeTab === 'export'"
          role="tabpanel"
          aria-label="Export collections"
          class="p-5"
        >
          <p class="text-xs text-text-secondary mb-4">
            Click a collection to download it as a JSON file.
          </p>

          <ul class="flex flex-col gap-1" aria-label="Collections to export">
            <li
              v-for="collection in collectionsStore.collections"
              :key="collection.id"
            >
              <button
                type="button"
                class="flex items-center justify-between w-full rounded px-3 py-2.5 text-sm
                       text-text-primary bg-dark-elevated border border-dark-border
                       hover:bg-dark-hover hover:border-dark-dim
                       focus:outline-none focus:ring-1 focus:ring-primary
                       transition-colors"
                :aria-label="`Export ${collection.name}`"
                @click="exportCollection(collection.id)"
              >
                <span class="truncate">{{ collection.name }}</span>
                <!-- Download icon -->
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 shrink-0 text-text-secondary ml-2"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0
                       011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0
                       111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </li>
          </ul>

          <!-- Empty state -->
          <div
            v-if="collectionsStore.collections.length === 0"
            class="text-center py-8"
          >
            <p class="text-sm text-dark-muted">No collections to export.</p>
          </div>
        </div>

        <!-- Import tab -->
        <div
          v-else-if="activeTab === 'import'"
          role="tabpanel"
          aria-label="Import collection"
          class="p-5"
        >
          <p class="text-xs text-text-secondary mb-1">
            Supported formats: Native JSON, Postman Collection v2.1, OpenAPI 3.x / Swagger 2.x (YAML or JSON).
          </p>
          <p class="text-xs text-dark-muted mb-4">
            If a collection name already exists, a numeric suffix will be appended.
          </p>

          <!-- File input -->
          <label
            class="flex flex-col items-center justify-center w-full h-32 rounded-lg
                   border-2 border-dashed border-dark-border bg-dark-elevated
                   hover:border-primary/50 hover:bg-dark-hover
                   cursor-pointer transition-colors"
            aria-label="Import file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-8 w-8 text-dark-muted mb-2"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0
                   010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1
                   1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="text-sm text-text-secondary">
              {{ isImporting ? 'Importing…' : 'Click to select a file' }}
            </span>
            <span class="text-xs text-dark-muted mt-1">.json, .yaml, .yml</span>
            <input
              ref="fileInputRef"
              type="file"
              class="sr-only"
              accept=".json,.yaml,.yml"
              aria-label="Select import file"
              :disabled="isImporting"
              @change="onFileSelected"
            />
          </label>

          <!-- Success message -->
          <div
            v-if="importSuccess"
            class="mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5
                   bg-success/10 border border-success/30"
            role="status"
            aria-live="polite"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 shrink-0 text-success"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0
                   011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="text-xs text-success">{{ importSuccess }}</span>
          </div>

          <!-- Error message -->
          <div
            v-if="importError"
            class="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5
                   bg-error/10 border border-error/30"
            role="alert"
            aria-live="assertive"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 shrink-0 text-error mt-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1
                   1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="text-xs text-error">{{ importError }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
