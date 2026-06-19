<script setup lang="ts">
/**
 * ParamsTab — displays URL query parameters as editable key-value rows.
 *
 * Bidirectionally syncs between:
 *   - The `modelValue` URL string (source of truth from parent)
 *   - Local `rows` reactive state (what the editor shows)
 *
 * When the URL changes externally → re-parse the query string → update rows.
 * When rows change → rebuild the query string → emit updated URL.
 *
 * Requirements: 2.4, 2.5, 2.6
 */
import { ref, watch } from 'vue'
import type { KeyValue } from '@/types'
import KeyValueEditor from '@/components/shared/KeyValueEditor.vue'

// ─── Props / Emits ────────────────────────────────────────────────────────────

interface Props {
  modelValue: string
  allowToggle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  allowToggle: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// ─── Local state ──────────────────────────────────────────────────────────────

/** The rows currently displayed in the editor. */
const rows = ref<KeyValue[]>([])

/**
 * Guard flag: when `true` we are in the middle of a programmatic rows-from-URL
 * update and should not re-emit back upward (avoids infinite loops).
 */
let syncingFromUrl = false

// ─── URL → rows (req 2.6) ─────────────────────────────────────────────────────

/**
 * Parse the query string portion of `url` into `KeyValue[]`.
 * Disabled rows have no equivalent in the URL, so newly parsed rows are
 * always enabled = true.
 */
function parseQueryParams(url: string): KeyValue[] {
  try {
    // Handle relative URLs or bare query strings by attaching a dummy base.
    const fullUrl = url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `http://placeholder${url.startsWith('/') ? '' : '/'}${url}`
    const parsed = new URL(fullUrl)
    const result: KeyValue[] = []
    parsed.searchParams.forEach((value, key) => {
      result.push({ key, value, enabled: true })
    })
    return result
  } catch {
    // Malformed URL — fall back to manual query-string parsing.
    const qIndex = url.indexOf('?')
    if (qIndex === -1) return []
    const qs = url.slice(qIndex + 1)
    if (!qs) return []
    return qs.split('&').map((pair) => {
      const eqIndex = pair.indexOf('=')
      if (eqIndex === -1) {
        return { key: decodeURIComponent(pair), value: '', enabled: true }
      }
      return {
        key: decodeURIComponent(pair.slice(0, eqIndex)),
        value: decodeURIComponent(pair.slice(eqIndex + 1)),
        enabled: true,
      }
    }).filter((r) => r.key !== '')
  }
}

/**
 * Build a URL string by replacing the query string of `baseUrl` with the
 * enabled rows serialised via `URLSearchParams`.
 */
function buildUrl(baseUrl: string, kvRows: KeyValue[]): string {
  // Determine the base (everything before the '?')
  const qIndex = baseUrl.indexOf('?')
  const base = qIndex === -1 ? baseUrl : baseUrl.slice(0, qIndex)

  const enabled = kvRows.filter((r) => r.enabled && r.key !== '')
  if (enabled.length === 0) return base

  const params = new URLSearchParams()
  for (const row of enabled) {
    params.append(row.key, row.value)
  }
  return `${base}?${params.toString()}`
}

// ─── Sync: URL → rows ─────────────────────────────────────────────────────────

watch(
  () => props.modelValue,
  (newUrl) => {
    // Avoid re-triggering when we ourselves just emitted the update.
    if (syncingFromUrl) return

    const parsed = parseQueryParams(newUrl)

    // Only update rows if the query string actually changed to avoid
    // clobbering user edits mid-keystroke.
    const currentSerialized = buildUrl(newUrl, rows.value)
    if (currentSerialized === newUrl && rows.value.length === parsed.length) return

    syncingFromUrl = true
    rows.value = parsed
    // Use queueMicrotask so the flag resets after Vue's reactive flush.
    queueMicrotask(() => { syncingFromUrl = false })
  },
  { immediate: true },
)

// ─── Sync: rows → URL (req 2.5) ───────────────────────────────────────────────

function onRowsChange(updated: KeyValue[]): void {
  rows.value = updated
  const newUrl = buildUrl(props.modelValue, updated)
  if (newUrl !== props.modelValue) {
    emit('update:modelValue', newUrl)
  }
}
</script>

<template>
  <div class="p-4">
    <KeyValueEditor
      :model-value="rows"
      :allow-toggle="allowToggle"
      key-placeholder="Parameter"
      value-placeholder="Value"
      @update:model-value="onRowsChange"
    />
  </div>
</template>
