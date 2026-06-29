/**
 * Component tests for `src/components/response/ResponseViewer.vue`
 *
 * Strategy:
 *  - Mock `@/db` so IndexedDB is never opened in jsdom.
 *  - Stub child components (ResponseBody, ResponseHeaders) to isolate
 *    ResponseViewer rendering and avoid Monaco / JsonTree complexity.
 *  - Mount via @vue/test-utils with a real Pinia instance (createPinia /
 *    setActivePinia) and seed uiStore state directly on the store instance.
 *  - Mock `navigator.clipboard` with vi.stubGlobal so the copy path is testable.
 *
 * Coverage:
 *  - Status code and status text are displayed (req 3.1)
 *  - Response time in ms is displayed (req 3.2)
 *  - JSON body causes ResponseBody to render (which in turn renders JsonTree) (req 3.3)
 *  - Plain-text body causes ResponseBody to render raw text (req 3.4)
 *  - Copy button in ResponseBody calls navigator.clipboard.writeText (req 3.6)
 *  - Network error (status === 0) shows descriptive error message (req 3.7)
 *  - Loading state shows a spinner / loading indicator (req 3.8)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { SendResult } from '@/types'

// ─── Mock @/db ────────────────────────────────────────────────────────────────
// Prevents `openDB` from running in the jsdom environment.

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

import ResponseViewer from '../ResponseViewer.vue'
import { useUiStore } from '@/stores/ui'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(overrides: Partial<SendResult> = {}): SendResult {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: '{"hello":"world"}',
    timeMs: 123,
    ...overrides,
  }
}

/**
 * Mount ResponseViewer with a fresh Pinia instance.
 * Seeds uiStore state directly to avoid any idb dependency.
 * Stubs ResponseBody and ResponseHeaders to isolate the viewer shell.
 */
function mountViewer(
  storeState: {
    lastResponse?: SendResult | null
    loading?: boolean
  } = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const uiStore = useUiStore()

  if (storeState.lastResponse !== undefined) {
    uiStore.lastResponse = storeState.lastResponse
  }
  if (storeState.loading !== undefined) {
    uiStore.loading = storeState.loading
  }

  const wrapper = mount(ResponseViewer, {
    global: {
      plugins: [pinia],
      stubs: {
        // Stub child panels to keep tests focused on ResponseViewer's own markup.
        ResponseBody: true,
        ResponseHeaders: true,
      },
    },
  })

  return { wrapper, uiStore }
}

/**
 * Mount ResponseViewer with real (unstubbed) ResponseBody so we can test
 * body-rendering and copy-button behaviour.
 */
function mountViewerWithRealBody(
  storeState: {
    lastResponse?: SendResult | null
    loading?: boolean
  } = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const uiStore = useUiStore()

  if (storeState.lastResponse !== undefined) {
    uiStore.lastResponse = storeState.lastResponse
  }
  if (storeState.loading !== undefined) {
    uiStore.loading = storeState.loading
  }

  // Stub JsonTree (deep child) to a minimal stub that renders a marker element,
  // so we can confirm it is mounted when the body is valid JSON.
  const wrapper = mount(ResponseViewer, {
    global: {
      plugins: [pinia],
      stubs: {
        ResponseHeaders: true,
        JsonTree: {
          name: 'JsonTree',
          template: '<div data-testid="json-tree-stub"></div>',
          props: ['data', 'depth'],
        },
      },
    },
  })

  return { wrapper, uiStore }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ResponseViewer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Loading indicator (req 3.8) ────────────────────────────────────────────

  describe('loading state (req 3.8)', () => {
    it('shows a loading indicator when uiStore.loading is true', () => {
      const { wrapper } = mountViewer({ loading: true })

      // The spinner region has aria-busy="true"
      expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
    })

    it('shows the "Sending request…" message while loading', () => {
      const { wrapper } = mountViewer({ loading: true })

      expect(wrapper.text()).toContain('Sending request')
    })

    it('does not show the response panel while loading', () => {
      const { wrapper } = mountViewer({
        loading: true,
        lastResponse: makeResponse(),
      })

      // The status metadata bar uses aria-label="Response metadata"
      expect(wrapper.find('[aria-label="Response metadata"]').exists()).toBe(false)
    })

    it('does not show the loading indicator when loading is false', () => {
      const { wrapper } = mountViewer({ loading: false, lastResponse: makeResponse() })

      expect(wrapper.find('[aria-busy="true"]').exists()).toBe(false)
    })
  })

  // ── Idle / no-response state ───────────────────────────────────────────────

  describe('idle state (no response)', () => {
    it('shows the idle placeholder when lastResponse is null and not loading', () => {
      const { wrapper } = mountViewer({ lastResponse: null, loading: false })

      // Uses aria-label="No response yet"
      expect(wrapper.find('[aria-label="No response yet"]').exists()).toBe(true)
    })

    it('prompts the user to click Send when idle', () => {
      const { wrapper } = mountViewer({ lastResponse: null })

      expect(wrapper.text()).toContain('Send')
    })
  })

  // ── Status code and status text (req 3.1) ─────────────────────────────────

  describe('status code and status text (req 3.1)', () => {
    it('displays the HTTP status code from lastResponse', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse({ status: 200 }) })

      expect(wrapper.text()).toContain('200')
    })

    it('displays the status text from lastResponse', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse({ statusText: 'OK' }) })

      expect(wrapper.text()).toContain('OK')
    })

    it('displays a 404 status code', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse({ status: 404, statusText: 'Not Found' }) })

      expect(wrapper.text()).toContain('404')
      expect(wrapper.text()).toContain('Not Found')
    })

    it('displays a 500 status code', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse({ status: 500, statusText: 'Internal Server Error' }) })

      expect(wrapper.text()).toContain('500')
      expect(wrapper.text()).toContain('Internal Server Error')
    })
  })

  // ── Response time (req 3.2) ────────────────────────────────────────────────

  describe('response time (req 3.2)', () => {
    it('displays the response time in milliseconds', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse({ timeMs: 123 }) })

      expect(wrapper.text()).toContain('123')
      expect(wrapper.text()).toContain('ms')
    })

    it('displays a different response time correctly', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse({ timeMs: 456 }) })

      expect(wrapper.text()).toContain('456')
    })

    it('shows the time in a title attribute for accessibility', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse({ timeMs: 789 }) })

      const timeEl = wrapper.find('[title*="789"]')
      expect(timeEl.exists()).toBe(true)
    })
  })

  // ── Network error message (req 3.7) ───────────────────────────────────────

  describe('network error message (req 3.7)', () => {
    it('displays a "Network Error" indicator when status is 0', () => {
      const { wrapper } = mountViewer({
        lastResponse: makeResponse({
          status: 0,
          statusText: '',
          body: 'Network Error',
        }),
      })

      expect(wrapper.text()).toContain('Network Error')
    })

    it('renders the error in a role="alert" element when status is 0', () => {
      const { wrapper } = mountViewer({
        lastResponse: makeResponse({ status: 0, statusText: '', body: '' }),
      })

      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })

    it('shows a fallback message when body is empty and status is 0', () => {
      const { wrapper } = mountViewer({
        lastResponse: makeResponse({ status: 0, statusText: '', body: '' }),
      })

      // The component falls back to "Request failed — check the URL and network connection."
      expect(wrapper.text()).toContain('Request failed')
    })

    it('does not show the role="alert" element for a successful 200 response', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse({ status: 200 }) })

      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
  })

  // ── JSON body renders JsonTree (req 3.3) ───────────────────────────────────

  describe('JSON body renders JsonTree (req 3.3)', () => {
    it('renders the JsonTree stub when the body is valid JSON', async () => {
      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body: '{"key":"value"}' }),
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="json-tree-stub"]').exists()).toBe(true)
    })

    it('shows "JSON" label in the body toolbar when body is valid JSON', async () => {
      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body: '[1,2,3]' }),
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('JSON')
    })

    it('does not render the JsonTree stub when body is plain text', async () => {
      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body: 'Hello World' }),
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="json-tree-stub"]').exists()).toBe(false)
    })
  })

  // ── Plain text body (req 3.4) ──────────────────────────────────────────────

  describe('plain text body (req 3.4)', () => {
    it('renders the raw body text in a <pre> element when body is not valid JSON', async () => {
      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body: 'Hello World' }),
      })

      await wrapper.vm.$nextTick()

      const pre = wrapper.find('pre')
      expect(pre.exists()).toBe(true)
      expect(pre.text()).toContain('Hello World')
    })

    it('shows "Text" label in the body toolbar when body is not valid JSON', async () => {
      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body: 'plain text response' }),
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Text')
    })

    it('renders XML body as plain text (since it is not valid JSON)', async () => {
      const xmlBody = '<root><item>value</item></root>'
      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body: xmlBody }),
      })

      await wrapper.vm.$nextTick()

      const pre = wrapper.find('pre')
      expect(pre.exists()).toBe(true)
      expect(pre.text()).toContain('<root>')
    })
  })

  // ── Copy button calls clipboard API (req 3.6) ─────────────────────────────

  describe('copy button calls clipboard API (req 3.6)', () => {
    it('calls navigator.clipboard.writeText with the response body when copy is clicked', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', {
        ...globalThis.navigator,
        clipboard: { writeText },
      })

      const body = '{"result":"ok"}'
      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body }),
      })

      await wrapper.vm.$nextTick()

      // The copy button is identified by aria-label
      const copyBtn = wrapper.find('button[aria-label="Copy body"]')
      expect(copyBtn.exists()).toBe(true)

      await copyBtn.trigger('click')

      expect(writeText).toHaveBeenCalledWith(body)
    })

    it('calls navigator.clipboard.writeText with plain-text body', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', {
        ...globalThis.navigator,
        clipboard: { writeText },
      })

      const body = 'plain text content'
      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body }),
      })

      await wrapper.vm.$nextTick()

      const copyBtn = wrapper.find('button[aria-label="Copy body"]')
      await copyBtn.trigger('click')

      expect(writeText).toHaveBeenCalledWith(body)
    })

    it('disables the copy button when there is no body', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', {
        ...globalThis.navigator,
        clipboard: { writeText },
      })

      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body: '' }),
      })

      await wrapper.vm.$nextTick()

      const copyBtn = wrapper.find('button[aria-label="Copy body"]')
      expect(copyBtn.exists()).toBe(true)
      expect((copyBtn.element as HTMLButtonElement).disabled).toBe(true)
    })

    it('shows "Copied!" label on the copy button after a successful copy', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', {
        ...globalThis.navigator,
        clipboard: { writeText },
      })

      const { wrapper } = mountViewerWithRealBody({
        lastResponse: makeResponse({ body: '{"x":1}' }),
      })

      await wrapper.vm.$nextTick()

      const copyBtn = wrapper.find('button[aria-label="Copy body"]')
      await copyBtn.trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('button[aria-label="Copied!"]').exists()).toBe(true)
    })
  })

  // ── Tab bar ────────────────────────────────────────────────────────────────

  describe('tab bar', () => {
    it('renders "Body" and "Headers" tabs in the tab list', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse() })

      const tabs = wrapper.findAll('[role="tab"]')
      const tabTexts = tabs.map(t => t.text())
      expect(tabTexts.some(t => t.includes('Body'))).toBe(true)
      expect(tabTexts.some(t => t.includes('Headers'))).toBe(true)
    })

    it('selects the Body tab by default', () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse() })

      const bodyTab = wrapper.findAll('[role="tab"]').find(t => t.text().includes('Body'))
      expect(bodyTab?.attributes('aria-selected')).toBe('true')
    })

    it('switches to the Headers tab when clicked', async () => {
      const { wrapper } = mountViewer({ lastResponse: makeResponse() })

      const headersTab = wrapper.findAll('[role="tab"]').find(t => t.text().includes('Headers'))
      await headersTab!.trigger('click')

      expect(headersTab?.attributes('aria-selected')).toBe('true')
    })
  })
})
