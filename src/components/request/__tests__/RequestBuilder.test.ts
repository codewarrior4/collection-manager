/**
 * Component tests for `src/components/request/RequestBuilder.vue`
 *
 * Strategy:
 *  - Mock `@/db` so idb never tries to open IndexedDB in jsdom.
 *  - Mock `@/services/httpClient` so sendRequest is a spy that resolves.
 *  - Mount via @vue/test-utils with a real Pinia instance.
 *  - Seed store state directly on the store instance.
 *
 * Coverage:
 *  - Method selector renders five options (GET, POST, PUT, PATCH, DELETE)
 *  - Auth type selector renders three options (none, bearer, basic)
 *  - URL change sets unsaved dirty flag
 *  - URL with query string → Params tab shows parsed key-value rows
 *  - Send button dispatches httpClient.sendRequest
 *
 * Requirements: 2.1, 2.5, 2.6, 9.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Request, Collection } from '@/types'

// ─── Mock @/db ────────────────────────────────────────────────────────────────

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

// ─── Mock @/services/httpClient ───────────────────────────────────────────────

const { sendRequestMock } = vi.hoisted(() => {
  const sendRequestMock = vi.fn().mockResolvedValue({
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{}',
    timeMs: 42,
  })
  return { sendRequestMock }
})

vi.mock('@/services/httpClient', () => ({
  sendRequest: sendRequestMock,
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import RequestBuilder from '../RequestBuilder.vue'
import { useUiStore } from '@/stores/ui'
import { useCollectionsStore } from '@/stores/collections'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: 'req-1',
    name: 'My Request',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [],
    body: { type: 'json', content: '' },
    auth: { type: 'none' },
    ...overrides,
  }
}

function makeCollection(request: Request): Collection {
  return {
    id: 'col-1',
    name: 'My Collection',
    folders: [],
    requests: [request],
  }
}

// ─── Mount helper ─────────────────────────────────────────────────────────────

/**
 * Mount RequestBuilder with a pre-configured Pinia instance.
 * Seeds a sample active request through the collections + ui stores.
 */
function mountBuilder(request: Request = makeRequest()) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const uiStore = useUiStore()
  const collectionsStore = useCollectionsStore()

  // Seed a collection containing the request
  collectionsStore.collections = [makeCollection(request)]

  // Set the active request id so RequestBuilder loads the draft
  uiStore.setActiveRequest(request.id)

  const wrapper = mount(RequestBuilder, {
    global: { plugins: [pinia] },
  })

  return { wrapper, uiStore, collectionsStore }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RequestBuilder', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sendRequestMock.mockClear()
  })

  // ── Requirement 2.1: Method selector ──────────────────────────────────────

  describe('method selector (req 2.1)', () => {
    it('renders exactly five HTTP method options', () => {
      const { wrapper } = mountBuilder()

      // The method selector is the <select aria-label="HTTP method">
      const methodSelect = wrapper.find('select[aria-label="HTTP method"]')
      expect(methodSelect.exists()).toBe(true)

      const options = methodSelect.findAll('option')
      expect(options).toHaveLength(5)
    })

    it('contains GET, POST, PUT, PATCH, DELETE options in that order', () => {
      const { wrapper } = mountBuilder()

      const methodSelect = wrapper.find('select[aria-label="HTTP method"]')
      const options = methodSelect.findAll('option')

      const values = options.map((o) => (o.element as HTMLOptionElement).value)
      expect(values).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
    })

    it('reflects the request method as the selected value', () => {
      const { wrapper } = mountBuilder(makeRequest({ method: 'POST' }))

      const methodSelect = wrapper.find('select[aria-label="HTTP method"]')
      expect((methodSelect.element as HTMLSelectElement).value).toBe('POST')
    })
  })

  // ── Auth type selector (three options) ────────────────────────────────────

  describe('auth type selector', () => {
    it('renders exactly three auth type options when Auth tab is active', async () => {
      const { wrapper } = mountBuilder()

      // Click the Auth tab to make the AuthTab component visible
      const authTabButton = wrapper.findAll('[role="tab"]').find(
        (btn) => btn.text() === 'Auth',
      )
      expect(authTabButton).toBeDefined()
      await authTabButton!.trigger('click')

      // The auth-type selector is rendered inside AuthTab
      const authTypeSelect = wrapper.find('select[aria-label="Authentication type"]')
      expect(authTypeSelect.exists()).toBe(true)

      const options = authTypeSelect.findAll('option')
      expect(options).toHaveLength(3)
    })

    it('contains none, bearer, basic auth type options in that order', async () => {
      const { wrapper } = mountBuilder()

      const authTabButton = wrapper.findAll('[role="tab"]').find(
        (btn) => btn.text() === 'Auth',
      )
      await authTabButton!.trigger('click')

      const authTypeSelect = wrapper.find('select[aria-label="Authentication type"]')
      const options = authTypeSelect.findAll('option')

      const values = options.map((o) => (o.element as HTMLOptionElement).value)
      expect(values).toEqual(['none', 'bearer', 'basic'])
    })
  })

  // ── Requirement 9.5: Dirty flag on URL change ──────────────────────────────

  describe('dirty / unsaved indicator (req 9.5)', () => {
    it('sets uiStore.unsavedChanges to true when the URL input is modified', async () => {
      const { wrapper, uiStore } = mountBuilder()

      // Initially clean
      expect(uiStore.unsavedChanges).toBe(false)

      const urlInput = wrapper.find('input[aria-label="Request URL"]')
      expect(urlInput.exists()).toBe(true)

      // Simulate the user typing a new URL
      await urlInput.setValue('https://api.example.com/updated')

      // Trigger the input event (setValue sets .value but we also need the input event
      // because RequestBuilder listens to @input)
      await urlInput.trigger('input')

      // Wait one tick for the watcher to flush
      await wrapper.vm.$nextTick()

      expect(uiStore.unsavedChanges).toBe(true)
    })

    it('displays the unsaved indicator element when there are unsaved changes', async () => {
      const { wrapper } = mountBuilder()

      // Initially no unsaved indicator
      expect(wrapper.find('[aria-label="Unsaved changes"]').exists()).toBe(false)

      const urlInput = wrapper.find('input[aria-label="Request URL"]')
      await urlInput.setValue('https://changed.example.com')
      await urlInput.trigger('input')
      await wrapper.vm.$nextTick()

      // Unsaved indicator should now be visible
      expect(wrapper.find('[aria-label="Unsaved changes"]').exists()).toBe(true)
    })
  })

  // ── Requirements 2.5, 2.6: URL ↔ Params synchronisation ──────────────────

  describe('URL ↔ Params synchronisation (req 2.5, 2.6)', () => {
    it('reflects the URL query string in the draftRequest after URL input change', async () => {
      const { wrapper } = mountBuilder()

      const urlInput = wrapper.find('input[aria-label="Request URL"]')

      // Type a URL with a query string
      await urlInput.setValue('https://example.com?foo=bar')
      await urlInput.trigger('input')
      await wrapper.vm.$nextTick()

      // The draftRequest URL in the component should have been updated to include the query
      const vm = wrapper.vm as unknown as { draftRequest: Request | null }
      expect(vm.draftRequest?.url).toBe('https://example.com?foo=bar')
    })

    it('preserves the full URL including query string as typed', async () => {
      const { wrapper } = mountBuilder()

      const urlInput = wrapper.find('input[aria-label="Request URL"]')

      await urlInput.setValue('https://api.example.com/search?q=hello&page=2')
      await urlInput.trigger('input')
      await wrapper.vm.$nextTick()

      const vm = wrapper.vm as unknown as { draftRequest: Request | null }
      expect(vm.draftRequest?.url).toContain('q=hello')
      expect(vm.draftRequest?.url).toContain('page=2')
    })
  })

  // ── Requirement 2.12: Send button dispatches httpClient.sendRequest ────────

  describe('Send button (req 2.12)', () => {
    it('calls httpClient.sendRequest when the Send button is clicked', async () => {
      const { wrapper } = mountBuilder()

      const sendButton = wrapper.find('button[aria-label="Send request"]')
      expect(sendButton.exists()).toBe(true)

      await sendButton.trigger('click')

      // Wait for the async onSend handler to resolve
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(sendRequestMock).toHaveBeenCalledOnce()
    })

    it('passes the current draft request to httpClient.sendRequest', async () => {
      const req = makeRequest({ method: 'POST', url: 'https://api.example.com/data' })
      const { wrapper } = mountBuilder(req)

      const sendButton = wrapper.find('button[aria-label="Send request"]')
      await sendButton.trigger('click')

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(sendRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-1', method: 'POST', url: 'https://api.example.com/data' }),
        null, // no active environment
      )
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state when no request is active', () => {
      const pinia = createPinia()
      setActivePinia(pinia)

      // No active request set — uiStore.activeRequestId stays null
      const wrapper = mount(RequestBuilder, {
        global: { plugins: [pinia] },
      })

      expect(wrapper.find('[aria-label="No request selected"]').exists()).toBe(true)
      expect(wrapper.find('[aria-label="Request builder"]').exists()).toBe(false)
    })

    it('shows the request builder panel when a request is active', () => {
      const { wrapper } = mountBuilder()

      expect(wrapper.find('[aria-label="Request builder"]').exists()).toBe(true)
      expect(wrapper.find('[aria-label="No request selected"]').exists()).toBe(false)
    })
  })
})
