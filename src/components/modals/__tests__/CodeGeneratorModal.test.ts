/**
 * Component tests for `src/components/modals/CodeGeneratorModal.vue`
 *
 * Strategy:
 *  - Mock `@/db` to prevent IndexedDB from running in jsdom.
 *  - Stub `MonacoEditor` to a lightweight component that exposes its `readOnly`
 *    and `modelValue` props as data attributes so assertions can inspect them
 *    without loading the heavy Monaco runtime.
 *  - Stub `generateSnippet` so tab-change tests remain deterministic and fast.
 *  - Mount via @vue/test-utils with a real Pinia instance (createPinia / setActivePinia).
 *  - Seed store state directly on the store instances.
 *
 * Coverage (Requirements 7.4, 7.5, 7.6):
 *  - Modal renders when uiStore.openModal === 'codeGenerator'
 *  - Modal does not render when openModal is null
 *  - No-request placeholder is shown when activeRequestId is null
 *  - Language tabs are rendered for cURL, PHP cURL, Laravel, JS Fetch, Axios (req 7.1 parity)
 *  - MonacoEditor is rendered with readOnly=true (req 7.4)
 *  - MonacoEditor receives the generated snippet as modelValue (req 7.4)
 *  - Switching tabs updates the snippet shown in MonacoEditor (req 7.6)
 *  - activeTabIndex resets to cURL when the modal is reopened (req 7.6)
 *  - Copy button calls navigator.clipboard.writeText with the current snippet (req 7.5)
 *  - Copy button shows "Copied!" feedback after a successful copy (req 7.5)
 *  - Copy button shows "Could not copy" toast on clipboard failure (req 7.5)
 *  - Close button calls uiStore.closeModal
 *
 * Requirements: 7.4, 7.5, 7.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Collection, Request, Environment } from '@/types'

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

// ─── Mock generateSnippet ─────────────────────────────────────────────────────
// Each call returns "<target>:<requestId>" so tests can verify which target was used.

vi.mock('@/services/codeGenerator', () => ({
  generateSnippet: vi.fn((request: Request, _env: unknown, target: string) => {
    return `${target}:${request.id}`
  }),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import CodeGeneratorModal from '../CodeGeneratorModal.vue'
import { useCollectionsStore } from '@/stores/collections'
import { useEnvironmentsStore } from '@/stores/environments'
import { useUiStore } from '@/stores/ui'
import { generateSnippet } from '@/services/codeGenerator'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRequest(id = 'req-1'): Request {
  return {
    id,
    name: 'Test Request',
    method: 'GET',
    url: 'https://example.com/api',
    headers: [],
    body: { type: 'json', content: '' },
    auth: { type: 'none' },
  }
}

function makeCollection(request: Request): Collection {
  return {
    id: 'col-1',
    name: 'Test Collection',
    folders: [],
    requests: [request],
  }
}

function makeEnv(id = 'env-1'): Environment {
  return { id, name: 'Local', variables: [] }
}

// ─── Mount helper ─────────────────────────────────────────────────────────────

interface MountOptions {
  activeRequestId?: string | null
  collections?: Collection[]
  activeEnvironment?: Environment | null
  openModal?: boolean
}

/**
 * MonacoEditor stub — exposes readOnly and modelValue as data attributes
 * so we can assert on them without loading the Monaco runtime.
 */
const MonacoEditorStub = {
  name: 'MonacoEditor',
  template: `
    <div
      data-testid="monaco-editor-stub"
      :data-read-only="String(readOnly)"
      :data-language="language"
      :data-model-value="modelValue"
    />
  `,
  props: {
    modelValue: { type: String, default: '' },
    language: { type: String, default: 'shell' },
    readOnly: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
}

function mountModal({
  activeRequestId = null,
  collections = [],
  activeEnvironment = null,
  openModal = true,
}: MountOptions = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const collectionsStore = useCollectionsStore()
  const environmentsStore = useEnvironmentsStore()
  const uiStore = useUiStore()

  // Seed collections
  collectionsStore.collections = collections

  // Seed active environment
  if (activeEnvironment) {
    environmentsStore.environments = [activeEnvironment]
    environmentsStore.activeId = activeEnvironment.id
  }

  // Seed active request + open modal
  if (activeRequestId) uiStore.activeRequestId = activeRequestId
  if (openModal) uiStore.showModal('codeGenerator')

  const wrapper = mount(CodeGeneratorModal, {
    global: {
      plugins: [pinia],
      stubs: {
        MonacoEditor: MonacoEditorStub,
      },
    },
  })

  return { wrapper, collectionsStore, environmentsStore, uiStore }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CodeGeneratorModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(generateSnippet).mockImplementation(
      (request: Request, _env: unknown, target: string) => `${target}:${request.id}`,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Visibility ─────────────────────────────────────────────────────────────

  describe('visibility', () => {
    it('renders when openModal is "codeGenerator"', () => {
      const { wrapper } = mountModal()
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    })

    it('does not render when openModal is null', () => {
      const { wrapper } = mountModal({ openModal: false })
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    })

    it('calls uiStore.closeModal when the close button is clicked', async () => {
      const { wrapper, uiStore } = mountModal()
      const closeModalSpy = vi.spyOn(uiStore, 'closeModal')

      await wrapper.find('button[aria-label="Close code generator"]').trigger('click')

      expect(closeModalSpy).toHaveBeenCalledOnce()
    })

    it('calls uiStore.closeModal when the backdrop is clicked', async () => {
      const { wrapper, uiStore } = mountModal()
      const closeModalSpy = vi.spyOn(uiStore, 'closeModal')

      await wrapper.find('[aria-hidden="true"]').trigger('click')

      expect(closeModalSpy).toHaveBeenCalledOnce()
    })
  })

  // ── No-request placeholder ─────────────────────────────────────────────────

  describe('no active request', () => {
    it('shows the no-request placeholder when activeRequestId is null', () => {
      const { wrapper } = mountModal({ activeRequestId: null })

      expect(wrapper.find('[aria-label="No active request"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('No request selected')
    })

    it('does not render the language tabs when no request is active', () => {
      const { wrapper } = mountModal({ activeRequestId: null })

      expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    })

    it('does not render the MonacoEditor stub when no request is active', () => {
      const { wrapper } = mountModal({ activeRequestId: null })

      expect(wrapper.find('[data-testid="monaco-editor-stub"]').exists()).toBe(false)
    })

    it('does not render the copy button when no request is active', () => {
      const { wrapper } = mountModal({ activeRequestId: null })

      // Copy button only appears when activeRequest is truthy (v-if="activeRequest")
      expect(wrapper.find('button[aria-label="Copy snippet"]').exists()).toBe(false)
    })
  })

  // ── Language tabs (req 7.1 parity) ─────────────────────────────────────────

  describe('language tabs', () => {
    function mountWithRequest() {
      const request = makeRequest()
      return mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })
    }

    it('renders all five language tabs', () => {
      const { wrapper } = mountWithRequest()
      const tabs = wrapper.findAll('[role="tab"]')
      const labels = tabs.map((t) => t.text())

      expect(labels).toContain('cURL')
      expect(labels).toContain('PHP cURL')
      expect(labels).toContain('Laravel')
      expect(labels).toContain('JS Fetch')
      expect(labels).toContain('Axios')
    })

    it('renders exactly five tabs', () => {
      const { wrapper } = mountWithRequest()
      expect(wrapper.findAll('[role="tab"]')).toHaveLength(5)
    })

    it('sets aria-selected="true" on the first tab by default', () => {
      const { wrapper } = mountWithRequest()
      const tabs = wrapper.findAll('[role="tab"]')
      expect(tabs[0].attributes('aria-selected')).toBe('true')
    })

    it('sets aria-selected="false" on all non-active tabs by default', () => {
      const { wrapper } = mountWithRequest()
      const tabs = wrapper.findAll('[role="tab"]')
      // Tabs 1–4 should be inactive
      tabs.slice(1).forEach((tab) => {
        expect(tab.attributes('aria-selected')).toBe('false')
      })
    })

    it('updates aria-selected when a tab is clicked', async () => {
      const { wrapper } = mountWithRequest()
      const tabs = wrapper.findAll('[role="tab"]')

      await tabs[2].trigger('click') // Laravel tab

      expect(tabs[2].attributes('aria-selected')).toBe('true')
      expect(tabs[0].attributes('aria-selected')).toBe('false')
    })

    it('has a tablist with aria-label "Target language"', () => {
      const { wrapper } = mountWithRequest()
      const tablist = wrapper.find('[role="tablist"]')
      expect(tablist.attributes('aria-label')).toBe('Target language')
    })
  })

  // ── MonacoEditor rendered read-only (req 7.4) ─────────────────────────────

  describe('MonacoEditor — read-only mode (req 7.4)', () => {
    it('passes readOnly=true to MonacoEditor', () => {
      const request = makeRequest()
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      const editor = wrapper.find('[data-testid="monaco-editor-stub"]')
      expect(editor.attributes('data-read-only')).toBe('true')
    })

    it('renders one MonacoEditor instance', () => {
      const request = makeRequest()
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      expect(wrapper.findAll('[data-testid="monaco-editor-stub"]')).toHaveLength(1)
    })

    it('passes the generated snippet as modelValue to MonacoEditor', () => {
      const request = makeRequest('req-42')
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      const editor = wrapper.find('[data-testid="monaco-editor-stub"]')
      // Default tab is cURL → snippet = "curl:req-42"
      expect(editor.attributes('data-model-value')).toBe('curl:req-42')
    })

    it('passes the "shell" language for the cURL tab', () => {
      const request = makeRequest()
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      const editor = wrapper.find('[data-testid="monaco-editor-stub"]')
      expect(editor.attributes('data-language')).toBe('shell')
    })

    it('passes the "php" language for the PHP cURL tab', async () => {
      const request = makeRequest()
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      const phpTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'PHP cURL')!
      await phpTab.trigger('click')

      const editor = wrapper.find('[data-testid="monaco-editor-stub"]')
      expect(editor.attributes('data-language')).toBe('php')
    })

    it('passes the "javascript" language for the JS Fetch tab', async () => {
      const request = makeRequest()
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      const jsTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'JS Fetch')!
      await jsTab.trigger('click')

      const editor = wrapper.find('[data-testid="monaco-editor-stub"]')
      expect(editor.attributes('data-language')).toBe('javascript')
    })
  })

  // ── Tab change updates snippet (req 7.6) ──────────────────────────────────

  describe('tab change updates snippet (req 7.6)', () => {
    it('generates a cURL snippet for the default (cURL) tab', () => {
      const request = makeRequest('req-abc')
      mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      expect(vi.mocked(generateSnippet)).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-abc' }),
        null,
        'curl',
      )
    })

    it('generates a PHP cURL snippet when the PHP cURL tab is selected', async () => {
      const request = makeRequest('req-abc')
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      const phpTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'PHP cURL')!
      await phpTab.trigger('click')

      expect(vi.mocked(generateSnippet)).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'req-abc' }),
        null,
        'php-curl',
      )
    })

    it('generates a Laravel snippet when the Laravel tab is selected', async () => {
      const request = makeRequest('req-abc')
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      const laravelTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Laravel')!
      await laravelTab.trigger('click')

      expect(vi.mocked(generateSnippet)).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'req-abc' }),
        null,
        'laravel',
      )
    })

    it('generates a JS Fetch snippet when the JS Fetch tab is selected', async () => {
      const request = makeRequest('req-abc')
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      const jsTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'JS Fetch')!
      await jsTab.trigger('click')

      expect(vi.mocked(generateSnippet)).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'req-abc' }),
        null,
        'js-fetch',
      )
    })

    it('generates an Axios snippet when the Axios tab is selected', async () => {
      const request = makeRequest('req-abc')
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      const axiosTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Axios')!
      await axiosTab.trigger('click')

      expect(vi.mocked(generateSnippet)).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'req-abc' }),
        null,
        'axios',
      )
    })

    it('updates the MonacoEditor modelValue when the tab changes', async () => {
      const request = makeRequest('req-xyz')
      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      // Default tab: cURL
      let editor = wrapper.find('[data-testid="monaco-editor-stub"]')
      expect(editor.attributes('data-model-value')).toBe('curl:req-xyz')

      // Switch to Axios tab
      const axiosTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Axios')!
      await axiosTab.trigger('click')

      editor = wrapper.find('[data-testid="monaco-editor-stub"]')
      expect(editor.attributes('data-model-value')).toBe('axios:req-xyz')
    })

    it('passes the active environment to generateSnippet', () => {
      const request = makeRequest('req-env')
      const env = makeEnv('env-99')
      mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
        activeEnvironment: env,
      })

      expect(vi.mocked(generateSnippet)).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-env' }),
        expect.objectContaining({ id: 'env-99' }),
        'curl',
      )
    })

    it('resets to the cURL tab when the modal is reopened', async () => {
      const request = makeRequest()
      const { wrapper, uiStore } = mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })

      // Switch away from the first tab
      const axiosTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Axios')!
      await axiosTab.trigger('click')

      const tabs = wrapper.findAll('[role="tab"]')
      expect(tabs[4].attributes('aria-selected')).toBe('true') // Axios is active

      // Close and reopen the modal
      uiStore.closeModal()
      await flushPromises()
      uiStore.showModal('codeGenerator')
      await flushPromises()

      // First tab (cURL) should be active again
      const freshTabs = wrapper.findAll('[role="tab"]')
      expect(freshTabs[0].attributes('aria-selected')).toBe('true')
      expect(freshTabs[4].attributes('aria-selected')).toBe('false')
    })
  })

  // ── Copy button (req 7.5) ──────────────────────────────────────────────────

  describe('copy button (req 7.5)', () => {
    function mountWithActiveRequest(requestId = 'req-copy') {
      const request = makeRequest(requestId)
      return mountModal({
        activeRequestId: request.id,
        collections: [makeCollection(request)],
      })
    }

    it('calls navigator.clipboard.writeText with the current snippet when Copy is clicked', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } })

      const { wrapper } = mountWithActiveRequest('req-1')

      await wrapper.find('button[aria-label="Copy snippet"]').trigger('click')
      await flushPromises()

      expect(writeText).toHaveBeenCalledWith('curl:req-1')
    })

    it('calls navigator.clipboard.writeText with the snippet for the active tab', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } })

      const { wrapper } = mountWithActiveRequest('req-tab')

      // Switch to JS Fetch tab
      const jsTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'JS Fetch')!
      await jsTab.trigger('click')

      await wrapper.find('button[aria-label="Copy snippet"]').trigger('click')
      await flushPromises()

      expect(writeText).toHaveBeenCalledWith('js-fetch:req-tab')
    })

    it('shows "Copied!" on the copy button after a successful copy', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } })

      const { wrapper } = mountWithActiveRequest()

      await wrapper.find('button[aria-label="Copy snippet"]').trigger('click')
      await flushPromises()

      // After a successful copy the aria-label changes to "Copied!"
      expect(wrapper.find('button[aria-label="Copied!"]').exists()).toBe(true)
    })

    it('shows "Could not copy" toast text when the clipboard write fails', async () => {
      const writeText = vi.fn().mockRejectedValue(new DOMException('Permission denied'))
      vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } })

      const { wrapper } = mountWithActiveRequest()

      await wrapper.find('button[aria-label="Copy snippet"]').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Could not copy')
    })

    it('does not call clipboard API when there is no snippet', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } })

      // generateSnippet returns empty string for this test
      vi.mocked(generateSnippet).mockReturnValue('')

      const { wrapper } = mountWithActiveRequest()

      await wrapper.find('button[aria-label="Copy snippet"]').trigger('click')
      await flushPromises()

      expect(writeText).not.toHaveBeenCalled()
    })
  })

  // ── Request lookup from nested structure ───────────────────────────────────

  describe('request lookup', () => {
    it('finds a request nested inside a folder', () => {
      const request = makeRequest('req-nested')
      const collection: Collection = {
        id: 'col-1',
        name: 'Col',
        folders: [
          {
            id: 'fol-1',
            name: 'Folder',
            folders: [],
            requests: [request],
          },
        ],
        requests: [],
      }

      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [collection],
      })

      // MonacoEditor should appear (no "no-request" placeholder)
      expect(wrapper.find('[data-testid="monaco-editor-stub"]').exists()).toBe(true)
      expect(wrapper.find('[aria-label="No active request"]').exists()).toBe(false)
    })

    it('finds a request nested two levels deep', () => {
      const request = makeRequest('req-deep')
      const collection: Collection = {
        id: 'col-1',
        name: 'Col',
        folders: [
          {
            id: 'fol-1',
            name: 'Level 1',
            folders: [
              {
                id: 'fol-2',
                name: 'Level 2',
                folders: [],
                requests: [request],
              },
            ],
            requests: [],
          },
        ],
        requests: [],
      }

      const { wrapper } = mountModal({
        activeRequestId: request.id,
        collections: [collection],
      })

      expect(wrapper.find('[data-testid="monaco-editor-stub"]').exists()).toBe(true)
    })

    it('shows the no-request placeholder when activeRequestId does not match any request', () => {
      const request = makeRequest('req-other')
      const { wrapper } = mountModal({
        activeRequestId: 'req-nonexistent',
        collections: [makeCollection(request)],
      })

      expect(wrapper.find('[aria-label="No active request"]').exists()).toBe(true)
    })
  })
})
