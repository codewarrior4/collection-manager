import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { db } from '@/db'
import type { Environment, KeyValue } from '@/types'

/** Deep-clone an object using structured clone, unwrapping Vue reactive proxies first. */
function deepClone<T>(value: T): T {
  return structuredClone(toRaw(value))
}

export const useEnvironmentsStore = defineStore('environments', () => {
  const environments = ref<Environment[]>([])
  const activeId = ref<string | null>(null)

  // ─── getters ────────────────────────────────────────────────────────────────

  /** The currently active Environment, or null if none is selected. */
  const activeEnvironment = computed<Environment | null>(
    () => environments.value.find((e) => e.id === activeId.value) ?? null,
  )

  /**
   * The enabled variables from the active environment, ready for interpolation.
   * Returns an empty array when no environment is active.
   */
  const resolvedVariables = computed<KeyValue[]>(() => {
    if (!activeEnvironment.value) return []
    return activeEnvironment.value.variables.filter((v) => v.enabled)
  })

  // ─── actions ─────────────────────────────────────────────────────────────────

  /**
   * Load all environments from IndexedDB into state.
   * Called once on application mount.
   */
  async function init(): Promise<void> {
    const database = await db
    environments.value = await database.getAll('environments')
  }

  /**
   * Create a new environment with the given name.
   * Persists to idb first; updates state on success.
   */
  async function createEnvironment(name: string): Promise<void> {
    const newEnv: Environment = {
      id: crypto.randomUUID(),
      name,
      variables: [],
    }
    try {
      const database = await db
      await database.put('environments', newEnv)
      environments.value.push(newEnv)
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to create environment. Please try again.')
    }
  }

  /**
   * Rename the environment with the given id.
   * Persists to idb first; updates state on success.
   */
  async function renameEnvironment(id: string, name: string): Promise<void> {
    const existing = environments.value.find((e) => e.id === id)
    if (!existing) return
    const updated: Environment = deepClone(existing)
    updated.name = name
    try {
      const database = await db
      await database.put('environments', updated)
      const idx = environments.value.findIndex((e) => e.id === id)
      if (idx !== -1) environments.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to rename environment. Please try again.')
    }
  }

  /**
   * Delete the environment with the given id.
   * If the deleted environment was active, clears the active selection.
   * Persists to idb first; updates state on success.
   */
  async function deleteEnvironment(id: string): Promise<void> {
    try {
      const database = await db
      await database.delete('environments', id)
      environments.value = environments.value.filter((e) => e.id !== id)
      if (activeId.value === id) {
        activeId.value = null
      }
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to delete environment. Please try again.')
    }
  }

  /**
   * Set the active environment by id.
   * Passing null deselects the active environment ("No Environment").
   */
  function setActive(id: string | null): void {
    activeId.value = id
  }

  /**
   * Add or update a variable in the given environment.
   * If a variable with the same key already exists, it is replaced.
   * Persists to idb first; updates state on success.
   */
  async function upsertVariable(envId: string, kv: KeyValue): Promise<void> {
    const existing = environments.value.find((e) => e.id === envId)
    if (!existing) return
    const updated: Environment = deepClone(existing)
    const varIdx = updated.variables.findIndex((v) => v.key === kv.key)
    if (varIdx !== -1) {
      updated.variables[varIdx] = kv
    } else {
      updated.variables.push(kv)
    }
    try {
      const database = await db
      await database.put('environments', updated)
      const idx = environments.value.findIndex((e) => e.id === envId)
      if (idx !== -1) environments.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to save variable. Please try again.')
    }
  }

  /**
   * Delete the variable matching the given key from the specified environment.
   * Persists to idb first; updates state on success.
   */
  async function deleteVariable(envId: string, key: string): Promise<void> {
    const existing = environments.value.find((e) => e.id === envId)
    if (!existing) return
    const updated: Environment = deepClone(existing)
    updated.variables = updated.variables.filter((v) => v.key !== key)
    try {
      const database = await db
      await database.put('environments', updated)
      const idx = environments.value.findIndex((e) => e.id === envId)
      if (idx !== -1) environments.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to delete variable. Please try again.')
    }
  }

  /**
   * Store a JWT token on the given environment.
   * Validates the token has three dot-separated segments before storing.
   * Persists to idb first; updates state on success.
   * Throws if the token format is invalid (callers should catch and display an error).
   */
  async function setJwtToken(envId: string, token: string): Promise<void> {
    const segments = token.split('.')
    if (segments.length !== 3) {
      throw new Error('Invalid JWT format: token must have three dot-separated segments.')
    }
    const existing = environments.value.find((e) => e.id === envId)
    if (!existing) return
    const updated: Environment = deepClone(existing)
    updated.jwtToken = token
    try {
      const database = await db
      await database.put('environments', updated)
      const idx = environments.value.findIndex((e) => e.id === envId)
      if (idx !== -1) environments.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to save JWT token. Please try again.')
    }
  }

  /**
   * Remove the JWT token from the given environment.
   * Persists to idb first; updates state on success.
   */
  async function clearJwtToken(envId: string): Promise<void> {
    const existing = environments.value.find((e) => e.id === envId)
    if (!existing) return
    const updated: Environment = deepClone(existing)
    delete updated.jwtToken
    try {
      const database = await db
      await database.put('environments', updated)
      const idx = environments.value.findIndex((e) => e.id === envId)
      if (idx !== -1) environments.value[idx] = updated
    } catch {
      const { useUiStore } = await import('./ui')
      const uiStore = useUiStore()
      uiStore.showError('Failed to clear JWT token. Please try again.')
    }
  }

  return {
    // state
    environments,
    activeId,
    // getters
    activeEnvironment,
    resolvedVariables,
    // actions
    init,
    createEnvironment,
    renameEnvironment,
    deleteEnvironment,
    setActive,
    upsertVariable,
    deleteVariable,
    setJwtToken,
    clearJwtToken,
  }
})
