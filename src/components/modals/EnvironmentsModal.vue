<script setup lang="ts">
/**
 * EnvironmentsModal — manage environments, variables, and JWT tokens.
 *
 * Features:
 *   - Left sidebar lists all environments; selecting one loads its variables and JWT token.
 *   - KeyValueEditor for environment variables.
 *   - JWT token input with real-time decode badge (green=valid, amber=expiring, red=expired/invalid).
 *   - "Set Active" sets the active environment in the store.
 *   - "Save JWT" and "Clear JWT" manage per-environment JWT storage.
 *   - Errors thrown by the store (e.g. invalid JWT format) are shown inline.
 *
 * Requirements: 4.4, 5.1, 5.2, 5.4, 5.5, 5.6, 5.7
 */
import { ref, computed, watch } from 'vue'
import { useEnvironmentsStore } from '@/stores/environments'
import { useUiStore } from '@/stores/ui'
import { decodeJwt } from '@/services/jwtDecoder'
import KeyValueEditor from '@/components/shared/KeyValueEditor.vue'
import type { KeyValue } from '@/types'

// ─── Stores ──────────────────────────────────────────────────────────────────

const environmentsStore = useEnvironmentsStore()
const uiStore = useUiStore()

// ─── Modal visibility ─────────────────────────────────────────────────────────

const isOpen = computed(() => uiStore.openModal === 'environments')

// ─── Selected environment ─────────────────────────────────────────────────────

const selectedEnvId = ref<string | null>(null)

const selectedEnv = computed(() =>
  environmentsStore.environments.find((e) => e.id === selectedEnvId.value) ?? null,
)

// Auto-select first environment when modal opens or environment list changes
watch(
  () => [isOpen.value, environmentsStore.environments] as const,
  ([open, envs]) => {
    if (open && envs.length > 0 && !selectedEnvId.value) {
      selectedEnvId.value = envs[0].id
    }
    if (open && envs.length === 0) {
      selectedEnvId.value = null
    }
  },
  { immediate: true },
)

// ─── Variables editor ─────────────────────────────────────────────────────────

const variables = computed<KeyValue[]>(() => selectedEnv.value?.variables ?? [])

async function onVariablesChange(updated: KeyValue[]): Promise<void> {
  if (!selectedEnv.value) return
  const env = selectedEnv.value
  // We diff to find additions/changes vs deletions. Simplest: remove all then re-add.
  // Actually the store has upsertVariable + deleteVariable, but for bulk updates
  // we'll update the environment directly by cloning and re-saving via upsertVariable calls.
  // For simplicity, we sync the entire list by upserting each entry:
  const existingKeys = new Set(env.variables.map((v) => v.key))
  const updatedKeys = new Set(updated.map((v) => v.key))

  // Delete removed
  for (const key of existingKeys) {
    if (!updatedKeys.has(key)) {
      await environmentsStore.deleteVariable(env.id, key)
    }
  }

  // Upsert new / changed
  for (const kv of updated) {
    await environmentsStore.upsertVariable(env.id, kv)
  }
}

// ─── JWT token input ──────────────────────────────────────────────────────────

const jwtInput = ref('')
const jwtError = ref<string | null>(null)

// Sync jwtInput when selected environment changes
watch(
  selectedEnv,
  (env) => {
    jwtInput.value = env?.jwtToken ?? ''
    jwtError.value = null
  },
  { immediate: true },
)

// ─── JWT badge ────────────────────────────────────────────────────────────────

const jwtInfo = computed(() => {
  const token = jwtInput.value.trim()
  if (!token) return null
  return decodeJwt(token)
})

const jwtBadge = computed<{ label: string; classes: string; dotClass: string } | null>(() => {
  const info = jwtInfo.value
  if (!info) return null

  if (!info.valid) {
    return {
      label: 'Invalid JWT',
      classes: 'bg-error/15 text-error border border-error/30',
      dotClass: 'bg-error',
    }
  }

  if (info.isExpired) {
    return {
      label: 'Expired',
      classes: 'bg-error/15 text-error border border-error/30',
      dotClass: 'bg-error',
    }
  }

  if (info.isExpiringSoon) {
    return {
      label: 'Expiring soon',
      classes: 'bg-warning/15 text-warning border border-warning/30',
      dotClass: 'bg-warning',
    }
  }

  return {
    label: 'Valid',
    classes: 'bg-success/15 text-success border border-success/30',
    dotClass: 'bg-success',
  }
})

// ─── JWT actions ──────────────────────────────────────────────────────────────

async function saveJwt(): Promise<void> {
  if (!selectedEnv.value) return
  jwtError.value = null
  try {
    await environmentsStore.setJwtToken(selectedEnv.value.id, jwtInput.value.trim())
  } catch (err) {
    jwtError.value = err instanceof Error ? err.message : 'Failed to save JWT token.'
  }
}

async function clearJwt(): Promise<void> {
  if (!selectedEnv.value) return
  jwtError.value = null
  await environmentsStore.clearJwtToken(selectedEnv.value.id)
  jwtInput.value = ''
}

// ─── Set active environment ───────────────────────────────────────────────────

function setActive(): void {
  if (!selectedEnv.value) return
  environmentsStore.setActive(selectedEnv.value.id)
}

// ─── New environment ──────────────────────────────────────────────────────────

const newEnvName = ref('')

async function createEnvironment(): Promise<void> {
  const name = newEnvName.value.trim()
  if (!name) return
  await environmentsStore.createEnvironment(name)
  newEnvName.value = ''
  // Select newly created environment
  const created = environmentsStore.environments[environmentsStore.environments.length - 1]
  if (created) selectedEnvId.value = created.id
}

// ─── Delete environment ───────────────────────────────────────────────────────

async function deleteEnvironment(): Promise<void> {
  if (!selectedEnv.value) return
  const id = selectedEnv.value.id
  await environmentsStore.deleteEnvironment(id)
  // Select first remaining environment
  selectedEnvId.value = environmentsStore.environments[0]?.id ?? null
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
    aria-label="Environments"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      aria-hidden="true"
      @click="close"
    />

    <!-- Dialog panel -->
    <div
      class="relative z-10 flex w-full max-w-4xl max-h-[85vh] rounded-xl
             bg-dark-card border border-dark-border shadow-2xl overflow-hidden"
    >
      <!-- ── Left sidebar: environment list ──────────────────────────────── -->
      <aside class="flex flex-col w-56 shrink-0 border-r border-dark-border bg-dark-elevated">
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-3 border-b border-dark-border">
          <h2 class="text-sm font-semibold text-text-primary">Environments</h2>
        </div>

        <!-- List -->
        <ul class="flex-1 overflow-y-auto py-1" role="listbox" aria-label="Environment list">
          <li
            v-for="env in environmentsStore.environments"
            :key="env.id"
            role="option"
            :aria-selected="selectedEnvId === env.id"
            class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors"
            :class="
              selectedEnvId === env.id
                ? 'bg-primary/15 text-primary'
                : 'text-text-secondary hover:bg-dark-hover hover:text-text-primary'
            "
            @click="selectedEnvId = env.id"
          >
            <!-- Active dot indicator -->
            <span
              v-if="environmentsStore.activeId === env.id"
              class="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
              title="Active environment"
              aria-label="Active"
            />
            <span
              v-else
              class="h-1.5 w-1.5 shrink-0 rounded-full bg-transparent"
              aria-hidden="true"
            />
            <span class="truncate">{{ env.name }}</span>
          </li>

          <li
            v-if="environmentsStore.environments.length === 0"
            class="px-3 py-4 text-sm text-dark-muted text-center"
          >
            No environments yet
          </li>
        </ul>

        <!-- New environment input -->
        <div class="border-t border-dark-border p-2">
          <form class="flex gap-1" @submit.prevent="createEnvironment">
            <input
              v-model="newEnvName"
              type="text"
              placeholder="New environment…"
              class="flex-1 h-7 rounded border border-dark-border bg-dark-card px-2 text-xs
                     text-text-primary placeholder:text-dark-muted
                     focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                     transition-colors"
              aria-label="New environment name"
            />
            <button
              type="submit"
              :disabled="!newEnvName.trim()"
              class="h-7 px-2 rounded text-xs font-medium bg-primary/20 text-primary
                     hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors"
              title="Create environment"
              aria-label="Create environment"
            >
              +
            </button>
          </form>
        </div>
      </aside>

      <!-- ── Right panel: environment editor ─────────────────────────────── -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <!-- Dialog title bar -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-dark-border shrink-0">
          <h2 class="text-base font-semibold text-text-primary">
            {{ selectedEnv ? selectedEnv.name : 'Select an environment' }}
          </h2>
          <div class="flex items-center gap-2">
            <!-- Set Active button -->
            <button
              v-if="selectedEnv"
              type="button"
              class="h-8 rounded px-3 text-xs font-medium
                     bg-success/15 text-success border border-success/30
                     hover:bg-success/25 transition-colors"
              :class="environmentsStore.activeId === selectedEnv.id
                ? 'opacity-60 cursor-default'
                : ''"
              :aria-pressed="environmentsStore.activeId === selectedEnv?.id"
              aria-label="Set Active"
              @click="setActive"
            >
              {{ environmentsStore.activeId === selectedEnv.id ? 'Active' : 'Set Active' }}
            </button>

            <!-- Delete environment -->
            <button
              v-if="selectedEnv"
              type="button"
              class="h-8 rounded px-3 text-xs font-medium
                     bg-error/10 text-error border border-error/30
                     hover:bg-error/20 transition-colors"
              aria-label="Delete environment"
              @click="deleteEnvironment"
            >
              Delete
            </button>

            <!-- Close button -->
            <button
              type="button"
              class="flex items-center justify-center h-8 w-8 rounded
                     text-text-secondary hover:text-text-primary hover:bg-dark-hover
                     focus:outline-none focus:ring-1 focus:ring-primary
                     transition-colors"
              aria-label="Close environments modal"
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

        <!-- Content area (scrollable) -->
        <div v-if="selectedEnv" class="flex-1 overflow-y-auto p-5 flex flex-col gap-6">

          <!-- ── Variables section ─────────────────────────────────────── -->
          <section aria-label="Environment variables">
            <h3 class="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Variables
            </h3>
            <KeyValueEditor
              :model-value="variables"
              allow-toggle
              key-placeholder="Variable name"
              value-placeholder="Value"
              @update:model-value="onVariablesChange"
            />
          </section>

          <!-- ── JWT token section ─────────────────────────────────────── -->
          <section aria-label="JWT token">
            <h3 class="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              JWT Bearer Token
            </h3>

            <!-- Token input row -->
            <div class="flex items-center gap-2 mb-2">
              <input
                v-model="jwtInput"
                type="text"
                placeholder="Paste a JWT token…"
                class="flex-1 h-9 rounded border border-dark-border bg-dark-elevated px-3
                       text-xs font-mono text-text-primary placeholder:text-dark-muted
                       focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                       transition-colors"
                aria-label="JWT token"
                @keyup.enter="saveJwt"
              />

              <!-- Badge -->
              <span
                v-if="jwtBadge"
                class="inline-flex items-center gap-1 shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                :class="jwtBadge.classes"
                role="status"
                :aria-label="`Token status: ${jwtBadge.label}`"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full shrink-0"
                  :class="jwtBadge.dotClass"
                  aria-hidden="true"
                />
                {{ jwtBadge.label }}
              </span>
            </div>

            <!-- Expiry hint -->
            <p
              v-if="jwtInfo?.valid && jwtInfo.expiresAt"
              class="text-xs text-text-secondary mb-2"
            >
              Expires: {{ jwtInfo.expiresAt.toLocaleString() }}
            </p>

            <!-- Inline error -->
            <p
              v-if="jwtError"
              class="text-xs text-error mb-2"
              role="alert"
              aria-live="assertive"
            >
              {{ jwtError }}
            </p>

            <!-- Actions -->
            <div class="flex gap-2">
              <button
                type="button"
                class="h-8 rounded px-3 text-xs font-medium
                       bg-primary/15 text-primary border border-primary/30
                       hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
                :disabled="!jwtInput.trim()"
                aria-label="Save JWT token"
                @click="saveJwt"
              >
                Save JWT
              </button>
              <button
                type="button"
                class="h-8 rounded px-3 text-xs font-medium
                       text-text-secondary border border-dark-border
                       hover:text-text-primary hover:bg-dark-hover
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
                :disabled="!selectedEnv?.jwtToken"
                aria-label="Clear JWT token"
                @click="clearJwt"
              >
                Clear JWT
              </button>
            </div>
          </section>
        </div>

        <!-- Empty state when no environment is selected -->
        <div
          v-else
          class="flex-1 flex items-center justify-center"
          aria-label="No environment selected"
        >
          <p class="text-sm text-dark-muted">
            Select or create an environment to get started.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
