<script setup lang="ts">
/**
 * HeadersTab — displays request headers as editable key-value rows
 * with enable/disable toggles per row.
 *
 * Requirements: 2.7
 */
import type { KeyValue } from '@/types'
import KeyValueEditor from '@/components/shared/KeyValueEditor.vue'

// ─── Props / Emits ────────────────────────────────────────────────────────────

interface Props {
  modelValue: KeyValue[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: KeyValue[]]
}>()

// ─── Handlers ─────────────────────────────────────────────────────────────────

function onHeadersChange(updated: KeyValue[]): void {
  emit('update:modelValue', updated)
}
</script>

<template>
  <div class="p-4">
    <KeyValueEditor
      :model-value="props.modelValue"
      :allow-toggle="true"
      key-placeholder="Header"
      value-placeholder="Value"
      @update:model-value="onHeadersChange"
    />
  </div>
</template>
