<script setup lang="ts">
import { watch, ref } from 'vue'
import { useUiStore } from '@/stores/ui'

// ─── Store ────────────────────────────────────────────────────────────────────

const uiStore = useUiStore()

// ─── Auto-dismiss timer ───────────────────────────────────────────────────────

const DISMISS_DELAY_MS = 5_000
let timer: ReturnType<typeof setTimeout> | null = null

/** Visible flag drives the enter/leave transition. */
const visible = ref(false)

watch(
  () => uiStore.errorMessage,
  (msg) => {
    // Clear any outstanding timer when the message changes.
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }

    if (msg !== null) {
      visible.value = true
      timer = setTimeout(() => {
        dismiss()
      }, DISMISS_DELAY_MS)
    } else {
      visible.value = false
    }
  },
)

// ─── Manual close ─────────────────────────────────────────────────────────────

function dismiss(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  visible.value = false
  // Give the leave-transition time to finish before clearing the message so
  // the text doesn't disappear before the banner slides out.
  setTimeout(() => {
    uiStore.clearError()
  }, 300)
}
</script>

<template>
  <!-- Fixed bottom-right notification banner -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="visible && uiStore.errorMessage"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        class="fixed bottom-5 right-5 z-[9999] flex items-start gap-3
               max-w-sm w-full rounded-lg border border-danger/30
               bg-dark-card shadow-panel px-4 py-3"
      >
        <!-- Error icon -->
        <span class="mt-0.5 shrink-0 text-danger" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
        </span>

        <!-- Message text -->
        <p class="flex-1 text-sm text-text-primary leading-snug break-words">
          {{ uiStore.errorMessage }}
        </p>

        <!-- Close button -->
        <button
          type="button"
          class="shrink-0 rounded p-0.5 text-text-secondary
                 hover:text-text-primary hover:bg-dark-hover
                 transition-colors focus:outline-none focus:ring-1 focus:ring-danger"
          aria-label="Dismiss notification"
          @click="dismiss"
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
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>
