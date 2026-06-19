<script setup lang="ts">
/**
 * BodyTab — displays the request body editor with mode selection.
 *
 * Supports three modes:
 *   - json: renders <MonacoEditor language="json"> bound to raw JSON string content
 *   - form: renders <KeyValueEditor> for multipart form-data (content is a JSON
 *           array of KeyValue objects serialised as a string)
 *   - x-www-form-urlencoded: same as form but for URL-encoded bodies
 *
 * Requirements: 2.8, 2.9
 */
import { computed } from 'vue'
import type { KeyValue } from '@/types'
import MonacoEditor from '@/components/shared/MonacoEditor.vue'
import KeyValueEditor from '@/components/shared/KeyValueEditor.vue'

// ─── Props / Emits ────────────────────────────────────────────────────────────

interface BodyValue {
  type: 'json' | 'form' | 'x-www-form-urlencoded'
  content: string
}

interface Props {
  modelValue: BodyValue
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: BodyValue]
}>()

// ─── Mode ─────────────────────────────────────────────────────────────────────

const BODY_MODES: BodyValue['type'][] = ['json', 'form', 'x-www-form-urlencoded']

function onModeChange(event: Event): void {
  const newType = (event.target as HTMLSelectElement).value as BodyValue['type']

  // When switching to a form mode, seed an empty KeyValue array if the current
  // content is not a valid JSON array (to avoid breaking the KeyValueEditor).
  let newContent = props.modelValue.content

  if (newType === 'form' || newType === 'x-www-form-urlencoded') {
    // Try to preserve existing content if it is already a valid KV array
    try {
      const parsed = JSON.parse(newContent)
      if (!Array.isArray(parsed)) {
        newContent = '[]'
      }
    } catch {
      newContent = '[]'
    }
  }
  // When switching to json, preserve whatever raw content we had (could be
  // empty string or leftover JSON).

  emit('update:modelValue', { type: newType, content: newContent })
}

// ─── JSON mode ────────────────────────────────────────────────────────────────

function onJsonChange(value: string): void {
  emit('update:modelValue', { ...props.modelValue, content: value })
}

// ─── Form mode — serialisation helpers ───────────────────────────────────────

/**
 * Parse the `content` string into a `KeyValue[]` for the KeyValueEditor.
 * Falls back to an empty array if content is blank or invalid JSON.
 */
const formRows = computed<KeyValue[]>(() => {
  const raw = props.modelValue.content
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

function onFormChange(rows: KeyValue[]): void {
  emit('update:modelValue', {
    ...props.modelValue,
    content: JSON.stringify(rows),
  })
}
</script>

<template>
  <div class="flex flex-col h-full">

    <!-- ── Mode selector ────────────────────────────────────────────────────── -->
    <div class="flex items-center gap-3 px-4 py-2 border-b border-dark-border shrink-0">
      <label
        for="body-mode-select"
        class="text-xs font-medium text-text-secondary uppercase tracking-wide shrink-0"
      >
        Body type
      </label>
      <div class="relative">
        <!-- Chevron icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
        <select
          id="body-mode-select"
          :value="modelValue.type"
          class="h-8 appearance-none rounded border border-dark-border bg-dark-elevated
                 pl-2 pr-7 text-xs font-mono text-text-primary
                 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                 transition-colors cursor-pointer"
          aria-label="Body content type"
          @change="onModeChange"
        >
          <option v-for="mode in BODY_MODES" :key="mode" :value="mode">
            {{ mode }}
          </option>
        </select>
      </div>
    </div>

    <!-- ── JSON editor ──────────────────────────────────────────────────────── -->
    <div
      v-if="modelValue.type === 'json'"
      class="flex-1 min-h-0"
      role="region"
      aria-label="JSON body editor"
    >
      <MonacoEditor
        :model-value="modelValue.content"
        language="json"
        class="h-full"
        @update:model-value="onJsonChange"
      />
    </div>

    <!-- ── Form / x-www-form-urlencoded editor ─────────────────────────────── -->
    <div
      v-else
      class="flex-1 overflow-y-auto p-4"
      role="region"
      :aria-label="modelValue.type === 'form' ? 'Form data editor' : 'URL-encoded form data editor'"
    >
      <KeyValueEditor
        :model-value="formRows"
        :allow-toggle="true"
        key-placeholder="Key"
        value-placeholder="Value"
        @update:model-value="onFormChange"
      />
    </div>

  </div>
</template>
