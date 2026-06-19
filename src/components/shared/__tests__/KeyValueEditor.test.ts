/**
 * Component tests for `src/components/shared/KeyValueEditor.vue`
 *
 * Strategy:
 *  - Mount the component via @vue/test-utils with a controlled `modelValue` prop.
 *  - Trigger user interactions (click / input) and assert the correct
 *    `update:modelValue` event payload is emitted.
 *  - No Pinia or real stores are needed — the component is fully prop-driven.
 *
 * Coverage:
 *  - Renders all rows from modelValue
 *  - "Add row" button appends an empty enabled row and emits the new array
 *  - Delete button on a row removes that row and emits the new array
 *  - Editing the key input emits the updated key for that row
 *  - Editing the value input emits the updated value for that row
 *  - Toggle checkbox (allowToggle=true) flips `enabled` and emits the new array
 *  - Toggle checkbox is NOT rendered when allowToggle is false (default)
 *  - Disabled inputs when allowToggle=true and row.enabled=false
 *  - Empty state message shown when modelValue is []
 *  - Custom placeholder props are forwarded to inputs
 *  - update:modelValue emit value correctness across all mutation types
 *
 * Requirements: 2.7, 4.4
 */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KeyValueEditor from '../KeyValueEditor.vue'
import type { KeyValue } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(
  key: string,
  value: string,
  enabled = true,
): KeyValue {
  return { key, value, enabled }
}

function mountEditor(
  modelValue: KeyValue[],
  extra: Record<string, unknown> = {},
) {
  return mount(KeyValueEditor, {
    props: { modelValue, ...extra },
  })
}

/** Find the "Add row" button — it is always the last button in the component. */
function findAddButton(wrapper: ReturnType<typeof mountEditor>) {
  const buttons = wrapper.findAll('button[type="button"]')
  return buttons[buttons.length - 1]
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('KeyValueEditor', () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders a row for each entry in modelValue', () => {
      const rows = [makeRow('Authorization', 'Bearer abc'), makeRow('Accept', 'application/json')]
      const wrapper = mountEditor(rows)

      const keyInputs = wrapper.findAll('input[type="text"]')
      // 2 rows × 2 inputs (key + value) = 4
      expect(keyInputs).toHaveLength(4)
      expect((keyInputs[0].element as HTMLInputElement).value).toBe('Authorization')
      expect((keyInputs[1].element as HTMLInputElement).value).toBe('Bearer abc')
      expect((keyInputs[2].element as HTMLInputElement).value).toBe('Accept')
      expect((keyInputs[3].element as HTMLInputElement).value).toBe('application/json')
    })

    it('shows an empty state message when modelValue is empty', () => {
      const wrapper = mountEditor([])
      expect(wrapper.text()).toContain('No items')
    })

    it('does not show the empty state message when there are rows', () => {
      const wrapper = mountEditor([makeRow('x', 'y')])
      expect(wrapper.text()).not.toContain('No items')
    })

    it('renders toggle checkboxes when allowToggle is true', () => {
      const rows = [makeRow('key', 'value')]
      const wrapper = mountEditor(rows, { allowToggle: true })

      const checkboxes = wrapper.findAll('input[type="checkbox"]')
      expect(checkboxes).toHaveLength(1)
    })

    it('does NOT render toggle checkboxes when allowToggle is false (default)', () => {
      const rows = [makeRow('key', 'value')]
      const wrapper = mountEditor(rows)

      const checkboxes = wrapper.findAll('input[type="checkbox"]')
      expect(checkboxes).toHaveLength(0)
    })

    it('reflects the checked state of the toggle checkbox from the row enabled prop', () => {
      const rows = [makeRow('a', 'b', true), makeRow('c', 'd', false)]
      const wrapper = mountEditor(rows, { allowToggle: true })

      const checkboxes = wrapper.findAll('input[type="checkbox"]')
      expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true)
      expect((checkboxes[1].element as HTMLInputElement).checked).toBe(false)
    })

    it('disables key and value inputs for a row when allowToggle=true and row.enabled=false', () => {
      const rows = [makeRow('key', 'val', false)]
      const wrapper = mountEditor(rows, { allowToggle: true })

      const textInputs = wrapper.findAll('input[type="text"]')
      expect((textInputs[0].element as HTMLInputElement).disabled).toBe(true)
      expect((textInputs[1].element as HTMLInputElement).disabled).toBe(true)
    })

    it('does not disable inputs when the row is enabled', () => {
      const rows = [makeRow('key', 'val', true)]
      const wrapper = mountEditor(rows, { allowToggle: true })

      const textInputs = wrapper.findAll('input[type="text"]')
      expect((textInputs[0].element as HTMLInputElement).disabled).toBe(false)
      expect((textInputs[1].element as HTMLInputElement).disabled).toBe(false)
    })

    it('forwards keyPlaceholder and valuePlaceholder to inputs', () => {
      const wrapper = mountEditor([makeRow('', '')], {
        keyPlaceholder: 'Header name',
        valuePlaceholder: 'Header value',
      })

      const textInputs = wrapper.findAll('input[type="text"]')
      expect((textInputs[0].element as HTMLInputElement).placeholder).toBe('Header name')
      expect((textInputs[1].element as HTMLInputElement).placeholder).toBe('Header value')
    })
  })

  // ── Add row ────────────────────────────────────────────────────────────────

  describe('add row', () => {
    it('emits update:modelValue with an appended empty enabled row when "Add row" is clicked', async () => {
      const existing = [makeRow('Content-Type', 'application/json')]
      const wrapper = mountEditor(existing)

      await findAddButton(wrapper).trigger('click')

      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted).toHaveLength(1)

      const payload = emitted![0][0] as KeyValue[]
      expect(payload).toHaveLength(2)
      expect(payload[0]).toEqual(existing[0])
      expect(payload[1]).toEqual({ key: '', value: '', enabled: true })
    })

    it('emits an array with one row when adding to an empty list', async () => {
      const wrapper = mountEditor([])

      const addButton = findAddButton(wrapper)
      await addButton.trigger('click')

      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted).toHaveLength(1)

      const payload = emitted![0][0] as KeyValue[]
      expect(payload).toHaveLength(1)
      expect(payload[0]).toEqual({ key: '', value: '', enabled: true })
    })

    it('preserves all existing rows in the correct order when appending', async () => {
      const existing = [
        makeRow('Accept', '*/*'),
        makeRow('X-Request-Id', '123'),
      ]
      const wrapper = mountEditor(existing)

      const addButton = findAddButton(wrapper)
      await addButton.trigger('click')

      const payload = (wrapper.emitted('update:modelValue')![0][0]) as KeyValue[]
      expect(payload[0]).toEqual(existing[0])
      expect(payload[1]).toEqual(existing[1])
      expect(payload[2]).toEqual({ key: '', value: '', enabled: true })
    })
  })

  // ── Remove row ─────────────────────────────────────────────────────────────

  describe('remove row', () => {
    it('emits update:modelValue without the deleted row when the delete button is clicked', async () => {
      const rows = [makeRow('Accept', 'application/json'), makeRow('X-Custom', 'foo')]
      const wrapper = mountEditor(rows)

      // First delete button removes row 0
      const deleteButtons = wrapper.findAll('button[title="Remove row"]')
      await deleteButtons[0].trigger('click')

      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted).toHaveLength(1)

      const payload = emitted![0][0] as KeyValue[]
      expect(payload).toHaveLength(1)
      expect(payload[0]).toEqual(rows[1])
    })

    it('removes the correct row when the second delete button is clicked', async () => {
      const rows = [makeRow('A', '1'), makeRow('B', '2'), makeRow('C', '3')]
      const wrapper = mountEditor(rows)

      const deleteButtons = wrapper.findAll('button[title="Remove row"]')
      await deleteButtons[1].trigger('click')

      const payload = (wrapper.emitted('update:modelValue')![0][0]) as KeyValue[]
      expect(payload).toHaveLength(2)
      expect(payload[0]).toEqual(rows[0])
      expect(payload[1]).toEqual(rows[2])
    })

    it('emits an empty array when the only row is deleted', async () => {
      const wrapper = mountEditor([makeRow('solo', 'row')])

      const deleteButton = wrapper.find('button[title="Remove row"]')
      await deleteButton.trigger('click')

      const payload = (wrapper.emitted('update:modelValue')![0][0]) as KeyValue[]
      expect(payload).toHaveLength(0)
    })
  })

  // ── Edit key input ─────────────────────────────────────────────────────────

  describe('edit key input', () => {
    it('emits update:modelValue with the updated key when the key input changes', async () => {
      const rows = [makeRow('old-key', 'some-value')]
      const wrapper = mountEditor(rows)

      const keyInput = wrapper.findAll('input[type="text"]')[0]
      await keyInput.setValue('new-key')

      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted).toHaveLength(1)

      const payload = emitted![0][0] as KeyValue[]
      expect(payload[0].key).toBe('new-key')
      expect(payload[0].value).toBe('some-value')
      expect(payload[0].enabled).toBe(true)
    })

    it('only modifies the key of the targeted row, leaving others unchanged', async () => {
      const rows = [makeRow('a', '1'), makeRow('b', '2')]
      const wrapper = mountEditor(rows)

      // key input of row 1 is at index 2 (row0-key, row0-value, row1-key, row1-value)
      const keyInput = wrapper.findAll('input[type="text"]')[2]
      await keyInput.setValue('updated-b')

      const payload = (wrapper.emitted('update:modelValue')![0][0]) as KeyValue[]
      expect(payload[0]).toEqual(rows[0])
      expect(payload[1].key).toBe('updated-b')
      expect(payload[1].value).toBe('2')
    })
  })

  // ── Edit value input ───────────────────────────────────────────────────────

  describe('edit value input', () => {
    it('emits update:modelValue with the updated value when the value input changes', async () => {
      const rows = [makeRow('Content-Type', 'text/plain')]
      const wrapper = mountEditor(rows)

      const valueInput = wrapper.findAll('input[type="text"]')[1]
      await valueInput.setValue('application/json')

      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted).toHaveLength(1)

      const payload = emitted![0][0] as KeyValue[]
      expect(payload[0].key).toBe('Content-Type')
      expect(payload[0].value).toBe('application/json')
      expect(payload[0].enabled).toBe(true)
    })

    it('only modifies the value of the targeted row, leaving others unchanged', async () => {
      const rows = [makeRow('x', '10'), makeRow('y', '20')]
      const wrapper = mountEditor(rows)

      // value input of row 0 is at index 1
      const valueInput = wrapper.findAll('input[type="text"]')[1]
      await valueInput.setValue('99')

      const payload = (wrapper.emitted('update:modelValue')![0][0]) as KeyValue[]
      expect(payload[0].key).toBe('x')
      expect(payload[0].value).toBe('99')
      expect(payload[1]).toEqual(rows[1])
    })
  })

  // ── Toggle enabled checkbox ────────────────────────────────────────────────

  describe('toggle enabled checkbox', () => {
    it('emits update:modelValue with enabled=false when an enabled row is unchecked', async () => {
      const rows = [makeRow('Authorization', 'Bearer tok', true)]
      const wrapper = mountEditor(rows, { allowToggle: true })

      const checkbox = wrapper.find('input[type="checkbox"]')
      await checkbox.setValue(false)

      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted).toHaveLength(1)

      const payload = emitted![0][0] as KeyValue[]
      expect(payload[0].enabled).toBe(false)
      expect(payload[0].key).toBe('Authorization')
      expect(payload[0].value).toBe('Bearer tok')
    })

    it('emits update:modelValue with enabled=true when a disabled row is checked', async () => {
      const rows = [makeRow('X-Custom', 'off', false)]
      const wrapper = mountEditor(rows, { allowToggle: true })

      const checkbox = wrapper.find('input[type="checkbox"]')
      await checkbox.setValue(true)

      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted).toHaveLength(1)

      const payload = emitted![0][0] as KeyValue[]
      expect(payload[0].enabled).toBe(true)
      expect(payload[0].key).toBe('X-Custom')
      expect(payload[0].value).toBe('off')
    })

    it('only toggles the targeted row when multiple rows exist', async () => {
      const rows = [
        makeRow('h1', 'v1', true),
        makeRow('h2', 'v2', true),
        makeRow('h3', 'v3', false),
      ]
      const wrapper = mountEditor(rows, { allowToggle: true })

      // Uncheck the second checkbox (row index 1)
      const checkboxes = wrapper.findAll('input[type="checkbox"]')
      await checkboxes[1].setValue(false)

      const payload = (wrapper.emitted('update:modelValue')![0][0]) as KeyValue[]
      expect(payload[0].enabled).toBe(true)   // row 0 — unchanged
      expect(payload[1].enabled).toBe(false)  // row 1 — toggled off
      expect(payload[2].enabled).toBe(false)  // row 2 — unchanged
    })
  })

  // ── Emit value correctness ─────────────────────────────────────────────────

  describe('update:modelValue emit value correctness', () => {
    it('emitted payload is a new array instance, not a mutation of the original', async () => {
      const original = [makeRow('k', 'v')]
      const wrapper = mountEditor(original)

      const addButton = findAddButton(wrapper)
      await addButton.trigger('click')

      const payload = wrapper.emitted('update:modelValue')![0][0] as KeyValue[]
      expect(payload).not.toBe(original)
    })

    it('emitted payload rows are new objects, not mutations of originals', async () => {
      const originalRow = makeRow('k', 'v')
      const wrapper = mountEditor([originalRow])

      const keyInput = wrapper.findAll('input[type="text"]')[0]
      await keyInput.setValue('updated')

      const payload = wrapper.emitted('update:modelValue')![0][0] as KeyValue[]
      expect(payload[0]).not.toBe(originalRow)
    })

    it('emits exactly once per user interaction', async () => {
      const wrapper = mountEditor([makeRow('k', 'v')])

      const addButton = findAddButton(wrapper)
      await addButton.trigger('click')

      expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    })

    it('each subsequent interaction produces a separate emit', async () => {
      const rows = [makeRow('a', '1'), makeRow('b', '2')]
      const wrapper = mountEditor(rows)

      const deleteButtons = wrapper.findAll('button[title="Remove row"]')
      await deleteButtons[0].trigger('click')

      // Re-mount with the new value isn't needed — we're testing the emit count
      const addButton = findAddButton(wrapper)
      await addButton.trigger('click')

      expect(wrapper.emitted('update:modelValue')).toHaveLength(2)
    })
  })
})
