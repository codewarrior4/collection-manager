// Feature: postman, Property 1: Variable Substitution Replaces All Matching Tokens

/**
 * Property-based tests for `src/services/variableSubstitution.ts`
 *
 * Property 1: Variable Substitution Replaces All Matching Tokens
 *   For any template containing {{key}} tokens with matching enabled variables,
 *   interpolate() must replace every such token. A second call on the result
 *   must be idempotent (produce the same output).
 *
 * Validates: Requirements 2.3, 2.12, 4.5
 *
 * Minimum iterations: 100 (configured via fc.configureGlobal)
 */

import * as fc from 'fast-check'
import { describe, expect, it, beforeAll } from 'vitest'
import { interpolate } from '../variableSubstitution'
import type { KeyValue } from '../../types'

// ---------------------------------------------------------------------------
// fast-check global configuration — minimum 100 iterations per property
// ---------------------------------------------------------------------------
beforeAll(() => {
  fc.configureGlobal({ numRuns: 100 })
})

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a valid token name: one or more characters that cannot include `}`
 * (matching the `/\{\{([^}]+)\}\}/g` regex capture group).
 * We further restrict to alphanumeric + underscore to produce realistic names
 * and avoid accidental collisions with the template scaffold characters.
 */
const tokenNameArb = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,19}$/)

/**
 * Generates a substitution value that is intentionally free of `{{…}}` patterns
 * so we can assert idempotency cleanly: if values themselves contained `{{x}}`
 * the second interpolation call might resolve more tokens, which is correct
 * behaviour but would complicate the idempotency assertion.
 */
const safeValueArb = fc.string({ minLength: 0, maxLength: 40 }).filter(
  (s) => !s.includes('{{') && !s.includes('}}'),
)

/**
 * Generates a non-empty array of unique token names that will be injected into
 * the template and provided as matching enabled variables.
 */
const tokenSetArb = fc
  .uniqueArray(tokenNameArb, { minLength: 1, maxLength: 8 })

/**
 * Builds a template string that contains each token name from `tokens` at
 * least once, surrounded by some static text. Additional static text segments
 * are inserted between tokens.
 *
 * Static segments are sanitised so they never end with `{` or start with `}`
 * which would create triple-brace patterns like `{{{token}}}` that the regex
 * `/\{\{([^}]+)\}\}/g` does not match as a simple `{{token}}`.
 */
function buildTemplate(tokens: string[], staticSegments: string[]): string {
  const sanitize = (s: string): string => {
    // Strip any trailing `{` and any leading `}`
    return s.replace(/\{+$/, '').replace(/^\}+/, '')
  }
  return tokens.reduce((acc, token, idx) => {
    const seg = sanitize(staticSegments[idx] ?? '')
    return `${acc}${seg}{{${token}}}`
  }, sanitize(staticSegments[tokens.length] ?? ''))
}

/**
 * Returns an `fc.Arbitrary` that produces `{ template, variables }` where:
 *  - `template` contains at least one `{{key}}` for every key in `variables`
 *  - every variable in `variables` has `enabled: true`
 *  - values are free of `{{…}}` to keep idempotency simple
 */
const templateWithMatchingVarsArb = fc
  .tuple(
    tokenSetArb,
    fc.array(fc.string({ maxLength: 20 }).filter((s) => !s.includes('{{') && !s.includes('}}')), {
      minLength: 9,
      maxLength: 9,
    }),
  )
  .chain(([tokens, staticSegments]) => {
    return fc
      .array(safeValueArb, { minLength: tokens.length, maxLength: tokens.length })
      .map((values): { template: string; variables: KeyValue[] } => {
        const template = buildTemplate(tokens, staticSegments)
        const variables: KeyValue[] = tokens.map((key, i) => ({
          key,
          value: values[i],
          enabled: true,
        }))
        return { template, variables }
      })
  })

// ---------------------------------------------------------------------------
// Property 1a: All matching tokens are replaced
// ---------------------------------------------------------------------------

describe('Property 1 — Variable Substitution Replaces All Matching Tokens', () => {
  it(
    'contains no {{key}} token in the result for any key present in the enabled variable set',
    () => {
      fc.assert(
        fc.property(templateWithMatchingVarsArb, ({ template, variables }) => {
          const { result } = interpolate(template, variables)

          // For every enabled variable, the corresponding {{key}} must not
          // appear anywhere in the result string.
          for (const { key } of variables) {
            expect(
              result.includes(`{{${key}}}`),
              `Token {{${key}}} was not replaced in result: "${result}"`,
            ).toBe(false)
          }
        }),
      )
    },
  )

  // ---------------------------------------------------------------------------
  // Property 1b: Idempotency — calling interpolate a second time on the result
  //              produces the same output
  // ---------------------------------------------------------------------------

  it('is idempotent: a second interpolate call on the result produces the same string', () => {
    fc.assert(
      fc.property(templateWithMatchingVarsArb, ({ template, variables }) => {
        const { result: firstPass } = interpolate(template, variables)
        const { result: secondPass } = interpolate(firstPass, variables)

        expect(secondPass).toBe(firstPass)
      }),
    )
  })

  // ---------------------------------------------------------------------------
  // Property 1c: No extra tokens are introduced — the result cannot contain
  //              new {{…}} patterns that were not present before substitution
  //              (guards against a buggy implementation that expands values
  //              containing braces into new tokens on the next pass)
  // ---------------------------------------------------------------------------

  it('does not introduce new {{…}} tokens that were absent from the original template', () => {
    fc.assert(
      fc.property(templateWithMatchingVarsArb, ({ template, variables }) => {
        // Build the set of token names that existed in the original template
        const tokenRegex = /\{\{([^}]+)\}\}/g
        const originalTokens = new Set<string>()
        let m: RegExpExecArray | null
        while ((m = tokenRegex.exec(template)) !== null) {
          originalTokens.add(m[1])
        }

        const { result } = interpolate(template, variables)

        // Any token remaining in the result must have been present originally
        tokenRegex.lastIndex = 0
        while ((m = tokenRegex.exec(result)) !== null) {
          expect(
            originalTokens.has(m[1]),
            `Unexpected new token {{${m[1]}}} appeared in result`,
          ).toBe(true)
        }
      }),
    )
  })

  // ---------------------------------------------------------------------------
  // Property 1d: Resolved token count matches variable set size
  //              (every enabled variable contributes at least one substitution)
  // ---------------------------------------------------------------------------

  it('the unresolved set is empty when all variables are enabled and match template tokens', () => {
    fc.assert(
      fc.property(templateWithMatchingVarsArb, ({ template, variables }) => {
        const { unresolved } = interpolate(template, variables)

        expect(unresolved.size).toBe(0)
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Edge-case properties using mixed enabled/disabled variables
// ---------------------------------------------------------------------------

describe('Property 1 — edge cases with disabled variables', () => {
  /**
   * Generates a scenario where some variables are enabled and some disabled.
   * The template contains tokens for both groups.
   */
  const mixedVarsArb = fc
    .tuple(
      tokenSetArb, // enabled token names
      tokenSetArb, // disabled token names (must be disjoint — handled below)
      fc.array(safeValueArb, { minLength: 8, maxLength: 16 }),
      fc.array(
        fc.string({ maxLength: 20 }).filter((s) => !s.includes('{{') && !s.includes('}}')),
        { minLength: 5, maxLength: 5 },
      ),
    )
    .filter(([enabled, disabled]) => {
      // Ensure no overlap between enabled and disabled token name sets
      return !enabled.some((t) => disabled.includes(t))
    })
    .map(([enabledTokens, disabledTokens, values, staticSegs]) => {
      const allTokens = [...enabledTokens, ...disabledTokens]
      const template = buildTemplate(allTokens, staticSegs)

      const variables: KeyValue[] = [
        ...enabledTokens.map((key, i) => ({ key, value: values[i] ?? 'v', enabled: true })),
        ...disabledTokens.map((key, i) => ({
          key,
          value: values[enabledTokens.length + i] ?? 'v',
          enabled: false,
        })),
      ]
      return { template, variables, enabledTokens, disabledTokens }
    })

  it('replaces all enabled-variable tokens while leaving disabled-variable tokens unchanged', () => {
    fc.assert(
      fc.property(mixedVarsArb, ({ template, variables, enabledTokens, disabledTokens }) => {
        const { result, unresolved } = interpolate(template, variables)

        // Enabled tokens must be gone
        for (const key of enabledTokens) {
          expect(
            result.includes(`{{${key}}}`),
            `Enabled token {{${key}}} was not replaced`,
          ).toBe(false)
        }

        // Disabled tokens must remain
        for (const key of disabledTokens) {
          expect(
            result.includes(`{{${key}}}`),
            `Disabled token {{${key}}} should remain unchanged`,
          ).toBe(true)
          expect(unresolved.has(key), `Disabled token "${key}" should be in unresolved set`).toBe(
            true,
          )
        }
      }),
    )
  })
})
