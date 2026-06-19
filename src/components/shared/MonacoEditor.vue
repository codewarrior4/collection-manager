<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import loader from '@monaco-editor/loader'
import type { Monaco } from '@monaco-editor/loader'

// ─── Props ────────────────────────────────────────────────────────────────────

interface MonacoEditorProps {
  modelValue: string
  language: 'json' | 'javascript' | 'php' | 'shell' | 'plaintext'
  readOnly?: boolean
}

const props = withDefaults(defineProps<MonacoEditorProps>(), {
  readOnly: false,
})

// ─── Emits ────────────────────────────────────────────────────────────────────

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// ─── State ────────────────────────────────────────────────────────────────────

const containerRef = ref<HTMLDivElement | null>(null)
const monacoFailed = ref(false)

// We keep references to the Monaco and editor instances so we can
// dispose them on unmount and update them on prop changes.
type MonacoEditor = ReturnType<Monaco['editor']['create']>
let monacoInstance: Monaco | null = null
let editor: MonacoEditor | null = null

// Used to suppress re-entrant updates: when we set the editor value
// programmatically we don't want the onChange listener to fire and
// emit a redundant update:modelValue.
let suppressNextChange = false

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!containerRef.value) return

  try {
    monacoInstance = await loader.init()
  } catch {
    monacoFailed.value = true
    return
  }

  editor = monacoInstance.editor.create(containerRef.value, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readOnly,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    tabSize: 2,
    wordWrap: 'on',
  })

  editor.onDidChangeModelContent(() => {
    if (suppressNextChange) {
      suppressNextChange = false
      return
    }
    emit('update:modelValue', editor!.getValue())
  })
})

onUnmounted(() => {
  editor?.dispose()
  editor = null
  monacoInstance = null
})

// ─── Watchers ─────────────────────────────────────────────────────────────────

/** Sync external modelValue changes into the editor without triggering emit. */
watch(
  () => props.modelValue,
  (newValue) => {
    if (!editor) return
    const current = editor.getValue()
    if (current !== newValue) {
      suppressNextChange = true
      editor.setValue(newValue)
    }
  },
)

/** Update the editor model language when the language prop changes. */
watch(
  () => props.language,
  (newLanguage) => {
    if (!editor || !monacoInstance) return
    const model = editor.getModel()
    if (model) {
      monacoInstance.editor.setModelLanguage(model, newLanguage)
    }
  },
)

/** Update the readOnly option when the prop changes. */
watch(
  () => props.readOnly,
  (newReadOnly) => {
    if (!editor) return
    editor.updateOptions({ readOnly: newReadOnly })
  },
)
</script>

<template>
  <!-- Monaco container — fills its parent; parent must have a defined height -->
  <div
    v-if="!monacoFailed"
    ref="containerRef"
    class="h-full w-full"
    aria-label="Code editor"
  />

  <!-- Textarea fallback when Monaco fails to load -->
  <textarea
    v-else
    :value="modelValue"
    :readonly="readOnly"
    :lang="language"
    class="h-full w-full resize-none rounded border border-dark-border bg-dark-elevated
           p-3 font-mono text-sm text-text-primary placeholder:text-dark-muted
           focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
           disabled:opacity-40 disabled:cursor-not-allowed"
    aria-label="Code editor (fallback)"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
