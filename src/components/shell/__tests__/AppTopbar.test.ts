/**
 * Component tests for `src/components/shell/AppTopbar.vue`
 *
 * Strategy:
 *  - Mock `@/db` so the idb module never tries to open IndexedDB in jsdom.
 *  - Mount via @vue/test-utils with a real Pinia instance (setActivePinia).
 *  - Mutate store state directly on the store instance to seed data.
 *  - Spy on store action methods to assert they are called with the correct arguments.
 *
 * Coverage:
 *  - Environment switcher lists all environments plus "No Environment"
 *  - "No Environment" option has value ""
 *  - Selecting an environment calls environmentsStore.setActive with the id
 *  - Selecting "No Environment" calls environmentsStore.setActive with null
 *  - The selected option reflects environmentsStore.activeId
 *  - Clicking "Environments" button calls uiStore.showModal('environments')
 *  - Clicking "Import / Export" button calls uiStore.showModal('importExport')
 *
 * Requirements: 4.2, 4.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Environment } from '@/types'

// ─── Mock @/db ───────────────────────────────────────────────────────────────
// Prevents `openDB` from running at import time in the jsdom environment.

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    getAll: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
  return { mockDb }
})

vi.mock('@/db', () => ({
  db: Promise.resolve(mockDb),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import AppTopbar from '../AppTopbar.vue'
import { useEnvironmentsStore } from '@/stores/environments'
import { useUiStore } from '@/stores/ui'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEnv(id: string, name: string): Environment {
  return { id, name, variables: [] }
}

/**
 * Mount AppTopbar with a fresh Pinia instance.
 * Seeds environment list and activeId directly on the store,
 * then spies on the actions we want to assert.
 */
function mountTopbar(
  environments: Environment[] = [],
  activeId: string | null = null,
) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const envStore = useEnvironmentsStore()
  const uiStore = useUiStore()

  // Seed state directly — bypasses idb entirely
  envStore.environments = environments
  envStore.activeId = activeId

  // Spy on the actions we want to assert
  const setActiveSpy = vi.spyOn(envStore, 'setActive')
  const showModalSpy = vi.spyOn(uiStore, 'showModal')

  const wrapper = mount(AppTopbar, {
    global: { plugins: [pinia] },
  })

  return { wrapper, envStore, uiStore, setActiveSpy, showModalSpy }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AppTopbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ── Environment switcher rendering ─────────────────────────────────────────

  describe('environment switcher', () => {
    it('renders a "No Environment" option with value ""', () => {
      const { wrapper } = mountTopbar()

      const options = wrapper.findAll('select option')
      expect(options[0].text()).toBe('No Environment')
      expect((options[0].element as HTMLOptionElement).value).toBe('')
    })

    it('lists all environments after the "No Environment" option', () => {
      const envs = [makeEnv('env-1', 'Local'), makeEnv('env-2', 'Staging')]
      const { wrapper } = mountTopbar(envs)

      const options = wrapper.findAll('select option')
      // First option is always "No Environment", then one per env
      expect(options).toHaveLength(3)
      expect(options[1].text()).toBe('Local')
      expect(options[2].text()).toBe('Staging')
    })

    it('renders only "No Environment" when the environments list is empty', () => {
      const { wrapper } = mountTopbar([])

      const options = wrapper.findAll('select option')
      expect(options).toHaveLength(1)
      expect(options[0].text()).toBe('No Environment')
    })

    it('reflects activeId as the selected value in the switcher', () => {
      const envs = [makeEnv('env-1', 'Local'), makeEnv('env-2', 'Production')]
      const { wrapper } = mountTopbar(envs, 'env-2')

      const select = wrapper.find('select')
      expect((select.element as HTMLSelectElement).value).toBe('env-2')
    })

    it('reflects null activeId as the "No Environment" selection (value "")', () => {
      const envs = [makeEnv('env-1', 'Local')]
      const { wrapper } = mountTopbar(envs, null)

      const select = wrapper.find('select')
      expect((select.element as HTMLSelectElement).value).toBe('')
    })
  })

  // ── setActive on selection ─────────────────────────────────────────────────

  describe('selecting an environment', () => {
    it('calls environmentsStore.setActive with the env id when an environment is selected', async () => {
      const envs = [makeEnv('env-1', 'Local'), makeEnv('env-2', 'Staging')]
      const { wrapper, setActiveSpy } = mountTopbar(envs)

      const select = wrapper.find('select')
      // setValue on a <select> triggers the change event internally in @vue/test-utils
      await select.setValue('env-1')

      expect(setActiveSpy).toHaveBeenCalledWith('env-1')
    })

    it('calls environmentsStore.setActive with null when "No Environment" is selected', async () => {
      const envs = [makeEnv('env-1', 'Local')]
      const { wrapper, setActiveSpy } = mountTopbar(envs, 'env-1')

      const select = wrapper.find('select')
      await select.setValue('')

      expect(setActiveSpy).toHaveBeenCalledWith(null)
    })

    it('calls setActive once for each selection change', async () => {
      const envs = [makeEnv('env-1', 'Local'), makeEnv('env-2', 'Staging')]
      const { wrapper, setActiveSpy } = mountTopbar(envs)

      const select = wrapper.find('select')
      // setValue on a <select> triggers the change event internally in @vue/test-utils
      await select.setValue('env-1')
      await select.setValue('env-2')

      expect(setActiveSpy).toHaveBeenCalledTimes(2)
      expect(setActiveSpy).toHaveBeenNthCalledWith(1, 'env-1')
      expect(setActiveSpy).toHaveBeenNthCalledWith(2, 'env-2')
    })

    it('does not call uiStore.showModal when an environment is selected', async () => {
      const envs = [makeEnv('env-1', 'Local')]
      const { wrapper, showModalSpy } = mountTopbar(envs)

      const select = wrapper.find('select')
      await select.setValue('env-1')

      expect(showModalSpy).not.toHaveBeenCalled()
    })
  })

  // ── Modal buttons ──────────────────────────────────────────────────────────

  describe('modal buttons', () => {
    it('calls uiStore.showModal("environments") when the Environments button is clicked', async () => {
      const { wrapper, showModalSpy } = mountTopbar()

      const button = wrapper.find('button[aria-label="Open Environments manager"]')
      await button.trigger('click')

      expect(showModalSpy).toHaveBeenCalledWith('environments')
    })

    it('calls uiStore.showModal("importExport") when the Import / Export button is clicked', async () => {
      const { wrapper, showModalSpy } = mountTopbar()

      const button = wrapper.find('button[aria-label="Open Import/Export"]')
      await button.trigger('click')

      expect(showModalSpy).toHaveBeenCalledWith('importExport')
    })

    it('calls uiStore.showModal exactly once per button click', async () => {
      const { wrapper, showModalSpy } = mountTopbar()

      const envButton = wrapper.find('button[aria-label="Open Environments manager"]')
      await envButton.trigger('click')
      await envButton.trigger('click')

      expect(showModalSpy).toHaveBeenCalledTimes(2)
    })

    it('does not call environmentsStore.setActive when a modal button is clicked', async () => {
      const { wrapper, setActiveSpy } = mountTopbar()

      const button = wrapper.find('button[aria-label="Open Environments manager"]')
      await button.trigger('click')

      expect(setActiveSpy).not.toHaveBeenCalled()
    })
  })

  // ── Application name ───────────────────────────────────────────────────────

  describe('application name', () => {
    it('displays the application name in the header', () => {
      const { wrapper } = mountTopbar()
      expect(wrapper.text()).toContain('API Collection Manager')
    })
  })
})
