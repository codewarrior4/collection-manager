/**
 * Unit tests for `src/services/variableSubstitution.ts`
 *
 * Covers:
 *  - Known substitutions (single and multiple tokens)
 *  - Missing keys (tokens with no matching variable)
 *  - Disabled entries (enabled === false must be skipped)
 *  - Nested-brace-like strings (e.g. `{{{key}}}`, `{{ }}`, `{{}}`)
 *  - Empty variables array
 *  - Empty template string
 *
 * Requirements: 2.3, 4.5, 4.6
 */

import { describe, expect, it } from 'vitest'
import { interpolate } from '../variableSubstitution'
import type { KeyValue } from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kv(key: string, value: string, enabled = true): KeyValue {
  return { key, value, enabled }
}

// ---------------------------------------------------------------------------
// Known substitutions
// ---------------------------------------------------------------------------

describe('interpolate — known substitutions', () => {
  it('replaces a single token with its matching variable value', () => {
    const { result, unresolved } = interpolate('Hello, {{name}}!', [kv('name', 'World')])

    expect(result).toBe('Hello, World!')
    expect(unresolved.size).toBe(0)
  })

  it('replaces multiple distinct tokens in one pass', () => {
    const vars = [kv('host', 'api.example.com'), kv('version', 'v2')]
    const { result, unresolved } = interpolate('https://{{host}}/{{version}}/users', vars)

    expect(result).toBe('https://api.example.com/v2/users')
    expect(unresolved.size).toBe(0)
  })

  it('replaces the same token wherever it appears in the template', () => {
    const { result, unresolved } = interpolate('{{base}}/a and {{base}}/b', [kv('base', 'http://x')])

    expect(result).toBe('http://x/a and http://x/b')
    expect(unresolved.size).toBe(0)
  })

  it('substitutes token whose value is an empty string', () => {
    const { result, unresolved } = interpolate('prefix-{{empty}}-suffix', [kv('empty', '')])

    expect(result).toBe('prefix--suffix')
    expect(unresolved.size).toBe(0)
  })

  it('substitutes a token whose value itself contains braces (non-token)', () => {
    const { result } = interpolate('value={{obj}}', [kv('obj', '{a:1}')])

    expect(result).toBe('value={a:1}')
  })

  it('replaces a token that spans numbers and underscores', () => {
    const { result, unresolved } = interpolate('/{{api_v2_base}}/resource', [
      kv('api_v2_base', 'https://api.example.com'),
    ])

    expect(result).toBe('/https://api.example.com/resource')
    expect(unresolved.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Missing keys
// ---------------------------------------------------------------------------

describe('interpolate — missing keys', () => {
  it('leaves a token unchanged when no variable matches its key', () => {
    const { result, unresolved } = interpolate('Hello, {{unknown}}!', [kv('name', 'Alice')])

    expect(result).toBe('Hello, {{unknown}}!')
    expect(unresolved.has('unknown')).toBe(true)
  })

  it('adds all unresolved token names to the returned Set', () => {
    const { result, unresolved } = interpolate('{{a}} + {{b}} = {{c}}', [kv('b', '2')])

    expect(result).toBe('{{a}} + 2 = {{c}}')
    expect(unresolved.has('a')).toBe(true)
    expect(unresolved.has('c')).toBe(true)
    expect(unresolved.has('b')).toBe(false)
    expect(unresolved.size).toBe(2)
  })

  it('returns the template unchanged and reports all tokens when variables array is provided but has no matching key', () => {
    const vars = [kv('x', '1'), kv('y', '2')]
    const { result, unresolved } = interpolate('{{z}} is missing', vars)

    expect(result).toBe('{{z}} is missing')
    expect(unresolved.has('z')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Disabled entries
// ---------------------------------------------------------------------------

describe('interpolate — disabled entries', () => {
  it('does not substitute a token whose matching variable is disabled', () => {
    const { result, unresolved } = interpolate('value={{token}}', [kv('token', 'secret', false)])

    expect(result).toBe('value={{token}}')
    expect(unresolved.has('token')).toBe(true)
  })

  it('substitutes only the enabled variable when both enabled and disabled entries share the same key', () => {
    // Last-write-wins for enabled; disabled must not overwrite.
    const vars: KeyValue[] = [
      { key: 'host', value: 'disabled-host', enabled: false },
      { key: 'host', value: 'enabled-host', enabled: true },
    ]
    const { result, unresolved } = interpolate('{{host}}', vars)

    expect(result).toBe('enabled-host')
    expect(unresolved.size).toBe(0)
  })

  it('treats a mix of enabled and disabled variables correctly', () => {
    const vars = [kv('a', 'AAA', true), kv('b', 'BBB', false), kv('c', 'CCC', true)]
    const { result, unresolved } = interpolate('{{a}}-{{b}}-{{c}}', vars)

    expect(result).toBe('AAA-{{b}}-CCC')
    expect(unresolved.has('b')).toBe(true)
    expect(unresolved.size).toBe(1)
  })

  it('reports a disabled-only token as unresolved', () => {
    const { result, unresolved } = interpolate('{{secret}}', [kv('secret', 'pwd', false)])

    expect(result).toBe('{{secret}}')
    expect(unresolved.has('secret')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Nested-brace-like strings
// ---------------------------------------------------------------------------

describe('interpolate — nested-brace-like strings', () => {
  it('does not match a triple-brace token ({{{key}}})', () => {
    // `{{{key}}}` — the regex `/\{\{([^}]+)\}\}/g` captures `{key` (the
    // `[^}]+` group matches `{key`, stopping before the first `}`), so the
    // captured token name is `{key`, which has no match in the variables map.
    // The whole string is therefore left unchanged.
    const vars = [kv('key', 'VALUE')]
    const { result, unresolved } = interpolate('{{{key}}}', vars)

    expect(result).toBe('{{{key}}}')
    expect(unresolved.has('{key')).toBe(true)
  })

  it('leaves `{{}}` (empty token) unchanged — no key to match', () => {
    const { result, unresolved } = interpolate('prefix{{}}suffix', [kv('', 'empty-key')])

    // An empty key in the variables array: if the regex captures an empty group
    // and the lookup has '' → substitute; otherwise leave unchanged.
    // The implementation uses `([^}]+)` which requires at least one character,
    // so `{{}}` is NOT matched and passes through unchanged.
    expect(result).toBe('prefix{{}}suffix')
    expect(unresolved.size).toBe(0)
  })

  it('handles a template with only braces and no tokens', () => {
    const { result, unresolved } = interpolate('{ } { }', [kv('x', 'X')])

    expect(result).toBe('{ } { }')
    expect(unresolved.size).toBe(0)
  })

  it('handles a JSON-like string without false positives', () => {
    const json = '{"key":"value","nested":{"a":1}}'
    const { result, unresolved } = interpolate(json, [kv('key', 'REPLACED')])

    // No `{{…}}` tokens in the JSON — nothing should be substituted.
    expect(result).toBe(json)
    expect(unresolved.size).toBe(0)
  })

  it('handles `{{ key }}` (token with spaces) as an unresolved token', () => {
    // The regex captures ` key ` (with spaces). `kv('key', …)` without spaces
    // does not match ` key `, so the token is left unchanged.
    const { result, unresolved } = interpolate('{{ key }}', [kv('key', 'VALUE')])

    expect(result).toBe('{{ key }}')
    expect(unresolved.has(' key ')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Empty variables array
// ---------------------------------------------------------------------------

describe('interpolate — empty variables array', () => {
  it('returns the template unchanged when variables is an empty array', () => {
    const { result, unresolved } = interpolate('https://{{host}}/{{path}}', [])

    expect(result).toBe('https://{{host}}/{{path}}')
    expect(unresolved.has('host')).toBe(true)
    expect(unresolved.has('path')).toBe(true)
    expect(unresolved.size).toBe(2)
  })

  it('returns an empty unresolved set for a token-free template with empty variables', () => {
    const { result, unresolved } = interpolate('no tokens here', [])

    expect(result).toBe('no tokens here')
    expect(unresolved.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Empty template
// ---------------------------------------------------------------------------

describe('interpolate — empty template', () => {
  it('returns an empty string and empty unresolved set when template is empty', () => {
    const { result, unresolved } = interpolate('', [kv('x', 'X'), kv('y', 'Y')])

    expect(result).toBe('')
    expect(unresolved.size).toBe(0)
  })

  it('returns an empty string and empty unresolved set when both template and variables are empty', () => {
    const { result, unresolved } = interpolate('', [])

    expect(result).toBe('')
    expect(unresolved.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Return value shape
// ---------------------------------------------------------------------------

describe('interpolate — return value', () => {
  it('always returns an object with `result` string and `unresolved` Set', () => {
    const output = interpolate('{{x}}', [])

    expect(typeof output.result).toBe('string')
    expect(output.unresolved).toBeInstanceOf(Set)
  })

  it('unresolved Set does not contain tokens that were successfully substituted', () => {
    const vars = [kv('resolved', 'yes'), kv('other', 'no')]
    const { unresolved } = interpolate('{{resolved}}-{{missing}}', vars)

    expect(unresolved.has('resolved')).toBe(false)
    expect(unresolved.has('missing')).toBe(true)
  })
})
