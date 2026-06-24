/**
 * Component tests for `src/components/modals/EnvironmentsModal.vue`
 *
 * Strategy:
 *  - Mock `@/db` to prevent IndexedDB from running in jsdom.
 *  - Use createPinia / setActivePinia with real stores.
 *  - Seed store state directly to avoid idb dependency.
 *  - Build real JWT tokens using btoa/base64url encoding for badge tests.
 *
 * Coverage:
 *  - JWT badge states: valid (green), expiring soon (amber), expired (red), invalid (red)
 *  - Save JWT calls environmentsStore.setJwtToken
 *  - Clear JWT calls environmentsStore.clearJwtToken
 *  - Set Active calls environmentsStore.setActive
 *
 * Requirements: 5.4, 5.5, 5.6, 5.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Environment } from '@/types'

// ─── Mock @/db ───────────────────────────────────────────────────────────────

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

import EnvironmentsModal from '../EnvironmentsModal.vue'
import { useEnvironmentsStore } from '@/stores/environments'
import { useUiStore } from '@/stores/ui'

// ─── JWT helper ───────────────────────────────────────────────────────────────

/**
 * Build a syntactically valid JWT string with the given `exp` timestamp (seconds).
 * Does NOT verify the signature — only the payload structure matters for decodeJwt.
 */
function makeJwt(expSeconds: number | undefined): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = expSeconds !== undefined ? { exp: expSeconds } : {}

  function toBase64Url(obj: object): string {
    const json = JSON.stringify(obj)
    return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  return `${toBase64Url(header)}.${toBase64Url(payload)}.fakesig`
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEnv(id: string, name: string, overrides: Partial<Environment> = {}): Environment {
  return { id, name, variables: [], ...overrides }
}

interface MountOptions {
  environments?: Environment[]
  activeId?: string | null
}

function mountModal({ environments = [], activeId = null }: MountOptions = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const envStore = useEnvironmentsStore()
  const uiStore = useUiStore()

  envStore.environments = environments
  envStore.activeId = activeId

  // Open the modal
  uiStore.showModal('environments')

  const wrapper = mount(EnvironmentsModal, {
    global: {
      plugins: [pinia],
      stubs: {
        // Stub KeyValueEditor to avoid rendering complexity
        KeyValueEditor: {
          name: 'KeyValueEditor',
          template: '<div data-testid="key-value-editor" />',
          props: ['modelValue', 'allowToggle'],
          emits: ['update:modelValue'],
        },
      },
    },
  })

  return { wrapper, envStore, uiStore }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EnvironmentsModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockDb.put.mockResolvedValue(undefined)
    mockDb.delete.mockResolvedValue(undefined)
  })

  // ── Visibility ─────────────────────────────────────────────────────────────

  describe('visibility', () => {
    it('renders when openModal is "environments"', () => {
      const { wrapper } = mountModal()
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    })

    it('does not render when openModal is null', () => {
      const pinia = createPinia()
      setActivePinia(pinia)
      const uiStore = useUiStore()
      uiStore.closeModal()

      const wrapper = mount(EnvironmentsModal, {
        global: { plugins: [pinia] },
      })

      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    })

    it('calls uiStore.closeModal when close button is clicked', async () => {
      const { wrapper, uiStore } = mountModal()
      const closeModalSpy = vi.spyOn(uiStore, 'closeModal')

      const closeBtn = wrapper.find('button[aria-label="Close environments modal"]')
      await closeBtn.trigger('click')

      expect(closeModalSpy).toHaveBeenCalledOnce()
    })
  })

  // ── Environment list ───────────────────────────────────────────────────────

  describe('environment list', () => {
    it('lists all environments in the sidebar', () => {
      const { wrapper } = mountModal({
        environments: [makeEnv('e1', 'Local'), makeEnv('e2', 'Staging')],
      })

      const listItems = wrapper.findAll('[role="option"]')
      expect(listItems).toHaveLength(2)
      expect(listItems[0].text()).toContain('Local')
      expect(listItems[1].text()).toContain('Staging')
    })

    it('shows "No environments yet" when list is empty', () => {
      const { wrapper } = mountModal({ environments: [] })
      expect(wrapper.text()).toContain('No environments yet')
    })

    it('auto-selects the first environment on open', async () => {
      const { wrapper } = mountModal({
        environments: [makeEnv('e1', 'Local'), makeEnv('e2', 'Staging')],
      })
      await flushPromises()

      // The selected environment's name appears in the right panel's h2 (second h2)
      const allH2s = wrapper.findAll('h2')
      const rightPanelH2 = allH2s.find((h) => h.text() === 'Local')
      expect(rightPanelH2).toBeDefined()
      expect(rightPanelH2!.text()).toContain('Local')
    })
  })

  // ── Set Active ─────────────────────────────────────────────────────────────

  describe('Set Active button', () => {
    it('calls environmentsStore.setActive with the selected environment id', async () => {
      const env = makeEnv('e1', 'Local')
      const { wrapper, envStore } = mountModal({ environments: [env] })
      await flushPromises()

      const setActiveSpy = vi.spyOn(envStore, 'setActive')
      const setActiveBtn = wrapper.find('button[aria-label="Set Active"]')
      expect(setActiveBtn.exists()).toBe(true)

      await setActiveBtn.trigger('click')

      expect(setActiveSpy).toHaveBeenCalledWith('e1')
    })

    it('shows "Active" label when the selected environment is already active', async () => {
      const env = makeEnv('e1', 'Local')
      const { wrapper } = mountModal({ environments: [env], activeId: 'e1' })
      await flushPromises()

      const setActiveBtn = wrapper.find('button[aria-label="Set Active"]')
      expect(setActiveBtn.text()).toBe('Active')
    })
  })

  // ── JWT badge: valid (green) ───────────────────────────────────────────────

  describe('JWT badge — valid (green)', () => {
    it('shows the "Valid" badge with success classes for a non-expiring JWT', async () => {
      // exp = now + 3600s (1 hour from now)
      const validJwt = makeJwt(nowSeconds() + 3600)
      const env = makeEnv('e1', 'Local', { jwtToken: validJwt })
      const { wrapper } = mountModal({ environments: [env] })
      await flushPromises()

      const badge = wrapper.find('[role="status"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toContain('Valid')
      expect(badge.classes().join(' ')).toContain('text-success')
    })
  })

  // ── JWT badge: expiring soon (amber) ──────────────────────────────────────

  describe('JWT badge — expiring soon (amber)', () => {
    it('shows the "Expiring soon" badge with warning classes for a JWT expiring within 5 minutes', async () => {
      // exp = now + 60s (1 minute from now — within the 5 min warning window)
      const expiringJwt = makeJwt(nowSeconds() + 60)
      const env = makeEnv('e1', 'Local', { jwtToken: expiringJwt })
      const { wrapper } = mountModal({ environments: [env] })
      await flushPromises()

      const badge = wrapper.find('[role="status"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toContain('Expiring soon')
      expect(badge.classes().join(' ')).toContain('text-warning')
    })
  })

  // ── JWT badge: expired (red) ───────────────────────────────────────────────

  describe('JWT badge — expired (red)', () => {
    it('shows the "Expired" badge with error classes for an expired JWT', async () => {
      // exp = now - 3600s (1 hour ago)
      const expiredJwt = makeJwt(nowSeconds() - 3600)
      const env = makeEnv('e1', 'Local', { jwtToken: expiredJwt })
      const { wrapper } = mountModal({ environments: [env] })
      await flushPromises()

      const badge = wrapper.find('[role="status"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toContain('Expired')
      expect(badge.classes().join(' ')).toContain('text-error')
    })
  })

  // ── JWT badge: invalid format (red) ───────────────────────────────────────

  describe('JWT badge — invalid format (red)', () => {
    it('shows the "Invalid JWT" badge with error classes for a non-JWT string', async () => {
      const env = makeEnv('e1', 'Local', { jwtToken: 'not-a-jwt' })
      const { wrapper } = mountModal({ environments: [env] })
      await flushPromises()

      const badge = wrapper.find('[role="status"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toContain('Invalid JWT')
      expect(badge.classes().join(' ')).toContain('text-error')
    })

    it('shows the "Invalid JWT" badge for a token missing segments', async () => {
      const env = makeEnv('e1', 'Local', { jwtToken: 'only.two' })
      const { wrapper } = mountModal({ environments: [env] })
      await flushPromises()

      const badge = wrapper.find('[role="status"]')
      expect(badge.text()).toContain('Invalid JWT')
    })
  })

  // ── No badge when no token ─────────────────────────────────────────────────

  describe('JWT badge — no token', () => {
    it('does not show a badge when there is no JWT token', async () => {
      const env = makeEnv('e1', 'Local')
      const { wrapper } = mountModal({ environments: [env] })
      await flushPromises()

      const badge = wrapper.find('[role="status"]')
      expect(badge.exists()).toBe(false)
    })
  })

  // ── Save JWT ───────────────────────────────────────────────────────────────

  describe('Save JWT button', () => {
    it('calls environmentsStore.setJwtToken with the env id and token value', async () => {
      const env = makeEnv('e1', 'Local')
      const { wrapper, envStore } = mountModal({ environments: [env] })
      await flushPromises()

      const setJwtTokenSpy = vi.spyOn(envStore, 'setJwtToken').mockResolvedValue()

      // Type a value into the JWT input
      const jwtInput = wrapper.find('input[aria-label="JWT token"]')
      await jwtInput.setValue('header.payload.sig')

      // Click Save JWT
      const saveBtn = wrapper.find('button[aria-label="Save JWT token"]')
      await saveBtn.trigger('click')
      await flushPromises()

      expect(setJwtTokenSpy).toHaveBeenCalledWith('e1', 'header.payload.sig')
    })

    it('shows inline error message when the store throws for invalid JWT format', async () => {
      const env = makeEnv('e1', 'Local')
      const { wrapper, envStore } = mountModal({ environments: [env] })
      await flushPromises()

      // Make the store throw
      vi.spyOn(envStore, 'setJwtToken').mockRejectedValue(
        new Error('Invalid JWT format: token must have three dot-separated segments.'),
      )

      const jwtInput = wrapper.find('input[aria-label="JWT token"]')
      await jwtInput.setValue('invalid-token')

      const saveBtn = wrapper.find('button[aria-label="Save JWT token"]')
      await saveBtn.trigger('click')
      await flushPromises()

      const errorEl = wrapper.find('[role="alert"]')
      expect(errorEl.exists()).toBe(true)
      expect(errorEl.text()).toContain('Invalid JWT format')
    })
  })

  // ── Clear JWT ──────────────────────────────────────────────────────────────

  describe('Clear JWT button', () => {
    it('calls environmentsStore.clearJwtToken with the env id', async () => {
      const validJwt = makeJwt(nowSeconds() + 3600)
      const env = makeEnv('e1', 'Local', { jwtToken: validJwt })
      const { wrapper, envStore } = mountModal({ environments: [env] })
      await flushPromises()

      const clearJwtTokenSpy = vi.spyOn(envStore, 'clearJwtToken').mockResolvedValue()

      const clearBtn = wrapper.find('button[aria-label="Clear JWT token"]')
      expect(clearBtn.attributes('disabled')).toBeUndefined()

      await clearBtn.trigger('click')
      await flushPromises()

      expect(clearJwtTokenSpy).toHaveBeenCalledWith('e1')
    })

    it('disables the Clear JWT button when no token is stored', async () => {
      const env = makeEnv('e1', 'Local') // no jwtToken
      const { wrapper } = mountModal({ environments: [env] })
      await flushPromises()

      const clearBtn = wrapper.find('button[aria-label="Clear JWT token"]')
      expect(clearBtn.attributes('disabled')).toBeDefined()
    })
  })
})
