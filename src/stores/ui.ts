import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SendResult } from '@/types'

export const useUiStore = defineStore('ui', () => {
  const activeRequestId = ref<string | null>(null)
  const unsavedChanges = ref(false)
  const openModal = ref<'environments' | 'codeGenerator' | 'importExport' | null>(null)
  const lastResponse = ref<SendResult | null>(null)
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  function setActiveRequest(id: string | null): void {
    activeRequestId.value = id
  }

  function setUnsaved(flag: boolean): void {
    unsavedChanges.value = flag
  }

  function showModal(name: 'environments' | 'codeGenerator' | 'importExport'): void {
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
    activeRequestId,
    unsavedChanges,
    openModal,
    lastResponse,
    loading,
    errorMessage,
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
