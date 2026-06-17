import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SendResult } from '@/types'

type ModalName = 'environments' | 'codeGenerator' | 'importExport'

export const useUiStore = defineStore('ui', () => {
  // ─── State ────────────────────────────────────────────────────────────────
  const activeRequestId = ref<string | null>(null)
  const unsavedChanges = ref(false)
  /** Which modal is currently open, or null if none. */
  const openModal = ref<ModalName | null>(null)
  const lastResponse = ref<SendResult | null>(null)
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  // ─── Actions ──────────────────────────────────────────────────────────────

  /** Sets the active request and clears the unsaved-changes flag. */
  function setActiveRequest(id: string | null): void {
    activeRequestId.value = id
    unsavedChanges.value = false
  }

  function setUnsaved(flag: boolean): void {
    unsavedChanges.value = flag
  }

  /**
   * Open a named modal.
   * Named `showModal` rather than `openModal` to avoid a key-name collision
   * with the `openModal` state ref in the return object.
   */
  function showModal(name: ModalName): void {
    openModal.value = name
  }

  function closeModal(): void {
    openModal.value = null
  }

  function setResponse(r: SendResult | null): void {
    lastResponse.value = r
  }

  function setLoading(flag: boolean): void {
    loading.value = flag
  }

  function showError(msg: string): void {
    errorMessage.value = msg
  }

  function clearError(): void {
    errorMessage.value = null
  }

  return {
    // State
    activeRequestId,
    unsavedChanges,
    openModal,
    lastResponse,
    loading,
    errorMessage,
    // Actions
    setActiveRequest,
    setUnsaved,
    showModal,
    closeModal,
    setResponse,
    setLoading,
    showError,
    clearError,
  }
})
