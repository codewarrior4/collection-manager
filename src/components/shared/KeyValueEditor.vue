<script setup lang="ts">
import { computed } from 'vue'
import type { KeyValue } from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  modelValue: KeyValue[]
  allowToggle?: boolean
  keyPlaceholder?: string
  valuePlaceholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  allowToggle: false,
  keyPlaceholder: 'Key',
  valuePlaceholder: 'Value',
})

// ─── Emits ────────────────────────────────────────────────────────────────────

const emit = defineEmits<{
  'update:modelValue': [value: KeyValue[]]
}>()

// ─── Computed helpers ─────────────────────────────────────────────────────────

const rows = computed(() => props.modelValue)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Emit a new array with the row at `index` replaced by `updated`. */
function updateRow(index: number, updated: Partial<KeyValue>): void {
  const next = rows.value.map((row, i) =>
    i === index ? { ...row, ...updated } : row,
  )
  emit('update:modelValue', next)
}

/** Append an empty, enabled row. */
function addRow(): void {
  emit('update:modelValue', [
    ...rows.value,
    { key: '', value: '', enabled: true },
  ])
}

/** Remove the row at `index`. */
function removeRow(index: number): void {
  emit('update:modelValue', rows.value.filter((_, i) => i !== index))
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <!-- ── Header row ──────────────────────────────────────────────────── -->
    <div
      class="grid gap-2 px-1 text-xs font-medium text-text-secondary uppercase tracking-wide"
      :class="allowToggle ? 'grid-cols-[20px_1fr_1fr_28px]' : 'grid-cols-[1fr_1fr_28px]'"
    >
      <span v-if="allowToggle" />
      <span>Key</span>
      <span>Value</span>
      <span />
    </div>

    <!-- ── Data rows ───────────────────────────────────────────────────── -->
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="grid gap-2 items-center"
      :class="allowToggle ? 'grid-cols-[20px_1fr_1fr_28px]' : 'grid-cols-[1fr_1fr_28px]'"
    >
      <!-- Enable/disable toggle -->
      <input
        v-if="allowToggle"
        type="checkbox"
        :checked="row.enabled"
        class="h-4 w-4 rounded border-dark-border bg-dark-elevated accent-primary cursor-pointer"
        :title="row.enabled ? 'Disable row' : 'Enable row'"
        @change="updateRow(index, { enabled: ($event.target as HTMLInputElement).checked })"
      />

      <!-- Key input -->
      <input
        type="text"
        :value="row.key"
        :placeholder="keyPlaceholder"
        :disabled="allowToggle && !row.enabled"
        class="h-8 rounded border border-dark-border bg-dark-elevated px-2 text-sm font-mono
               text-text-primary placeholder:text-dark-muted
               focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
               disabled:opacity-40 disabled:cursor-not-allowed
               transition-colors"
        @input="updateRow(index, { key: ($event.target as HTMLInputElement).value })"
      />

      <!-- Value input -->
      <input
        type="text"
        :value="row.value"
        :placeholder="valuePlaceholder"
        :disabled="allowToggle && !row.enabled"
        class="h-8 rounded border border-dark-border bg-dark-elevated px-2 text-sm font-mono
               text-text-primary placeholder:text-dark-muted
               focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
               disabled:opacity-40 disabled:cursor-not-allowed
               transition-colors"
        @input="updateRow(index, { value: ($event.target as HTMLInputElement).value })"
      />

      <!-- Delete button -->
      <button
        type="button"
        class="flex items-center justify-center h-7 w-7 rounded
               text-text-secondary hover:text-danger hover:bg-dark-hover
               transition-colors"
        title="Remove row"
        @click="removeRow(index)"
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
            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>

    <!-- ── Empty state ─────────────────────────────────────────────────── -->
    <p
      v-if="rows.length === 0"
      class="py-2 text-sm text-dark-muted text-center"
    >
      No items. Click <strong class="text-text-secondary">+</strong> to add one.
    </p>

    <!-- ── Add row button ──────────────────────────────────────────────── -->
    <button
      type="button"
      class="mt-1 flex items-center gap-1.5 self-start rounded px-2 py-1 text-xs
             text-text-secondary hover:text-text-primary hover:bg-dark-hover
             transition-colors"
      @click="addRow"
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
          d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
          clip-rule="evenodd"
        />
      </svg>
      Add row
    </button>
  </div>
</template>
