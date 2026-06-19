<script setup lang="ts">
import { useEnvironmentsStore } from '@/stores/environments'
import { useUiStore } from '@/stores/ui'

// ─── Stores ───────────────────────────────────────────────────────────────────

const environmentsStore = useEnvironmentsStore()
const uiStore = useUiStore()

// ─── Handlers ─────────────────────────────────────────────────────────────────

function onEnvironmentChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  environmentsStore.setActive(value === '' ? null : value)
}
</script>

<template>
  <header
    class="flex items-center gap-3 px-4 h-12 shrink-0
           bg-dark-card border-b border-dark-border z-10"
  >
    <!-- Application name -->
    <span
      class="font-display font-semibold text-base text-text-primary tracking-tight select-none"
      aria-label="API Collection Manager"
    >
      API Collection Manager
    </span>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Environment switcher -->
    <div class="flex items-center gap-2">
      <label
        for="env-switcher"
        class="text-xs text-text-secondary whitespace-nowrap"
      >
        Environment
      </label>
      <div class="relative">
        <!-- Chevron icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0
               111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
        <select
          id="env-switcher"
          :value="environmentsStore.activeId ?? ''"
          class="h-8 appearance-none rounded border border-dark-border bg-dark-elevated
                 pl-3 pr-8 text-sm text-text-primary
                 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                 transition-colors cursor-pointer"
          aria-label="Select active environment"
          @change="onEnvironmentChange"
        >
          <option value="">No Environment</option>
          <option
            v-for="env in environmentsStore.environments"
            :key="env.id"
            :value="env.id"
          >
            {{ env.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Divider -->
    <div class="h-5 w-px bg-dark-border" aria-hidden="true" />

    <!-- Environments modal button -->
    <button
      type="button"
      class="flex items-center gap-1.5 h-8 rounded px-3 text-xs font-medium
             text-text-secondary border border-dark-border bg-dark-elevated
             hover:text-text-primary hover:border-dark-dim
             focus:outline-none focus:ring-1 focus:ring-primary
             transition-colors"
      title="Manage environments"
      aria-label="Open Environments manager"
      @click="uiStore.showModal('environments')"
    >
      <!-- Env icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
          clip-rule="evenodd"
        />
      </svg>
      Environments
    </button>

    <!-- Import / Export modal button -->
    <button
      type="button"
      class="flex items-center gap-1.5 h-8 rounded px-3 text-xs font-medium
             text-text-secondary border border-dark-border bg-dark-elevated
             hover:text-text-primary hover:border-dark-dim
             focus:outline-none focus:ring-1 focus:ring-primary
             transition-colors"
      title="Import or export collections"
      aria-label="Open Import/Export"
      @click="uiStore.showModal('importExport')"
    >
      <!-- Upload/download icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-3.5 w-3.5"
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
      Import / Export
    </button>
  </header>
</template>
