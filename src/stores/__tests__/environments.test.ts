/**
 * Unit tests for `src/stores/environments.ts`
 *
 * Strategy:
 *  - Mock `@/db` so every test controls idb success / failure independently.
 *  - Mock `@/stores/ui` so `showError` calls can be verified without a real
 *    Pinia uiStore being configured.
 *  - Each test creates a fresh Pinia instance via `createPinia()` so store
 *    state never leaks between tests.
 *
 * Coverage:
 *  - init() loads all environments from idb into state
 *  - createEnvironment() adds a new environment with correct structure
 *  - renameEnvironment() updates the name field in state
 *  - deleteEnvironment() removes the environment from state; clears activeId
 *  - setActive() sets / clears the activeId and computed activeEnvironment
 *  - upsertVariable() adds a new variable or replaces an existing one
 *  - deleteVariable() removes a variable by key
 *  - setJwtToken() stores a valid JWT; throws on invalid format
 *  - clearJwtToken() removes jwtToken from the environment
 *  - resolvedVariables getter returns only enabled variables for the active env
 *  - idb failure leaves state unchanged and calls uiStore.showError()
 *
 * Requirements: 4.1, 5.1, 5.2
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Environment, KeyValue } from '@/types'

// ─── Mock @/db ───────────────────────────────────────────────────────────────

const { mockDb, mockShowError } = vi.hoisted(() => {
  const mockDb = {
    getAll: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
  const mockShowError = vi.fn()
  return { mockDb, mockShowError }
})

vi.mock('@/db', () => ({
  db: Promise.resolve(mockDb),
}))

// ─── Mock @/stores/ui ────────────────────────────────────────────────────────

vi.mock('@/stores/ui', () => ({
  useUiStore: () => ({ showError: mockShowError }),
}))

// ─── Import store (after mocks are in place) ─────────────────────────────────

import { useEnvironmentsStore } from '../environments'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeKV(
  key: string,
  value: string,
  enabled = true,
): KeyValue {
  return { key, value, enabled }
}

function makeEnvironment(overrides: Partial<Environment> = {}): Environment {
  return {
    id: crypto.randomUUID(),
    name: 'Test Environment',
    variables: [],
    ...overrides,
  }
}

/** Build a minimal syntactically-valid (but unsigned) JWT with the given exp. */
function buildJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  const payload = btoa(JSON.stringify({ sub: '1234567890', exp }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${header}.${payload}.fakesignature`
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockDb.getAll.mockResolvedValue([])
  mockDb.put.mockResolvedValue(undefined)
  mockDb.delete.mockResolvedValue(undefined)
})

// ─── init() ──────────────────────────────────────────────────────────────────

describe('environmentsStore — init()', () => {
  it('loads all environments from idb into state', async () => {
    const env1 = makeEnvironment({ name: 'Local' })
    const env2 = makeEnvironment({ name: 'Staging' })
    mockDb.getAll.mockResolvedValue([env1, env2])

    const store = useEnvironmentsStore()
    await store.init()

    expect(store.environments).toHaveLength(2)
    expect(store.environments[0].name).toBe('Local')
    expect(store.environments[1].name).toBe('Staging')
    expect(mockDb.getAll).toHaveBeenCalledWith('environments')
  })

  it('results in an empty array when idb returns no environments', async () => {
    mockDb.getAll.mockResolvedValue([])

    const store = useEnvironmentsStore()
    await store.init()

    expect(store.environments).toHaveLength(0)
  })
})

// ─── createEnvironment() ─────────────────────────────────────────────────────

describe('environmentsStore — createEnvironment()', () => {
  it('adds a new environment with correct structure to state on success', async () => {
    const store = useEnvironmentsStore()
    await store.createEnvironment('Production')

    expect(store.environments).toHaveLength(1)
    const env = store.environments[0]
    expect(env.name).toBe('Production')
    expect(env.variables).toEqual([])
    expect(env.jwtToken).toBeUndefined()
    expect(typeof env.id).toBe('string')
    expect(env.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('persists to idb with the correct store name', async () => {
    const store = useEnvironmentsStore()
    await store.createEnvironment('Dev')

    expect(mockDb.put).toHaveBeenCalledOnce()
    const [storeName, value] = mockDb.put.mock.calls[0] as [string, Environment]
    expect(storeName).toBe('environments')
    expect(value.name).toBe('Dev')
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    mockDb.put.mockRejectedValue(new Error('disk full'))

    const store = useEnvironmentsStore()
    await store.createEnvironment('Will Fail')

    expect(store.environments).toHaveLength(0)
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to create environment')
  })
})

// ─── renameEnvironment() ─────────────────────────────────────────────────────

describe('environmentsStore — renameEnvironment()', () => {
  it('updates the environment name in state on success', async () => {
    const env = makeEnvironment({ name: 'Old Name' })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    await store.renameEnvironment(env.id, 'New Name')

    expect(store.environments[0].name).toBe('New Name')
    expect(mockDb.put).toHaveBeenCalledOnce()
    const [, putArg] = mockDb.put.mock.calls[0] as [string, Environment]
    expect(putArg.name).toBe('New Name')
  })

  it('does nothing when the id is not found', async () => {
    const store = useEnvironmentsStore()
    await store.renameEnvironment('non-existent-id', 'New Name')

    expect(mockDb.put).not.toHaveBeenCalled()
    expect(store.environments).toHaveLength(0)
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const env = makeEnvironment({ name: 'Original' })
    mockDb.getAll.mockResolvedValue([env])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useEnvironmentsStore()
    await store.init()
    await store.renameEnvironment(env.id, 'Changed')

    expect(store.environments[0].name).toBe('Original')
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to rename environment')
  })
})

// ─── deleteEnvironment() ─────────────────────────────────────────────────────

describe('environmentsStore — deleteEnvironment()', () => {
  it('removes the environment from state on success', async () => {
    const env = makeEnvironment({ name: 'To Delete' })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    await store.deleteEnvironment(env.id)

    expect(store.environments).toHaveLength(0)
    expect(mockDb.delete).toHaveBeenCalledWith('environments', env.id)
  })

  it('keeps other environments when deleting one', async () => {
    const env1 = makeEnvironment({ name: 'Keep' })
    const env2 = makeEnvironment({ name: 'Delete Me' })
    mockDb.getAll.mockResolvedValue([env1, env2])

    const store = useEnvironmentsStore()
    await store.init()
    await store.deleteEnvironment(env2.id)

    expect(store.environments).toHaveLength(1)
    expect(store.environments[0].id).toBe(env1.id)
  })

  it('clears activeId when the active environment is deleted', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    store.setActive(env.id)
    expect(store.activeId).toBe(env.id)

    await store.deleteEnvironment(env.id)

    expect(store.activeId).toBeNull()
    expect(store.activeEnvironment).toBeNull()
  })

  it('does not clear activeId when a non-active environment is deleted', async () => {
    const active = makeEnvironment({ name: 'Active' })
    const other = makeEnvironment({ name: 'Other' })
    mockDb.getAll.mockResolvedValue([active, other])

    const store = useEnvironmentsStore()
    await store.init()
    store.setActive(active.id)
    await store.deleteEnvironment(other.id)

    expect(store.activeId).toBe(active.id)
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])
    mockDb.delete.mockRejectedValue(new Error('idb delete failed'))

    const store = useEnvironmentsStore()
    await store.init()
    await store.deleteEnvironment(env.id)

    expect(store.environments).toHaveLength(1)
    expect(store.environments[0].id).toBe(env.id)
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to delete environment')
  })
})

// ─── setActive() ─────────────────────────────────────────────────────────────

describe('environmentsStore — setActive()', () => {
  it('sets the activeId to the given environment id', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    store.setActive(env.id)

    expect(store.activeId).toBe(env.id)
  })

  it('the activeEnvironment computed reflects the newly active environment', async () => {
    const env = makeEnvironment({ name: 'Staging' })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    store.setActive(env.id)

    expect(store.activeEnvironment).not.toBeNull()
    expect(store.activeEnvironment!.name).toBe('Staging')
  })

  it('clears the active environment when passed null', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    store.setActive(env.id)
    store.setActive(null)

    expect(store.activeId).toBeNull()
    expect(store.activeEnvironment).toBeNull()
  })

  it('returns null for activeEnvironment when no environment matches activeId', () => {
    const store = useEnvironmentsStore()
    store.setActive('unknown-id')

    expect(store.activeEnvironment).toBeNull()
  })

  it('does not call idb (setActive is synchronous state-only)', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    vi.clearAllMocks()
    store.setActive(env.id)

    expect(mockDb.put).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })
})

// ─── resolvedVariables getter ─────────────────────────────────────────────────

describe('environmentsStore — resolvedVariables getter', () => {
  it('returns only enabled variables from the active environment', async () => {
    const env = makeEnvironment({
      variables: [
        makeKV('BASE_URL', 'https://api.example.com', true),
        makeKV('DEBUG', 'true', false),
        makeKV('API_KEY', 'secret', true),
      ],
    })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    store.setActive(env.id)

    expect(store.resolvedVariables).toHaveLength(2)
    expect(store.resolvedVariables.map((v) => v.key)).toContain('BASE_URL')
    expect(store.resolvedVariables.map((v) => v.key)).toContain('API_KEY')
    expect(store.resolvedVariables.map((v) => v.key)).not.toContain('DEBUG')
  })

  it('returns an empty array when no environment is active', () => {
    const store = useEnvironmentsStore()
    expect(store.resolvedVariables).toEqual([])
  })

  it('returns an empty array when the active environment has no variables', async () => {
    const env = makeEnvironment({ variables: [] })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    store.setActive(env.id)

    expect(store.resolvedVariables).toEqual([])
  })

  it('returns an empty array when all variables are disabled', async () => {
    const env = makeEnvironment({
      variables: [
        makeKV('KEY1', 'val1', false),
        makeKV('KEY2', 'val2', false),
      ],
    })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    store.setActive(env.id)

    expect(store.resolvedVariables).toEqual([])
  })
})

// ─── upsertVariable() ────────────────────────────────────────────────────────

describe('environmentsStore — upsertVariable()', () => {
  it('adds a new variable when the key does not exist', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    await store.upsertVariable(env.id, makeKV('HOST', 'localhost'))

    expect(store.environments[0].variables).toHaveLength(1)
    expect(store.environments[0].variables[0].key).toBe('HOST')
    expect(store.environments[0].variables[0].value).toBe('localhost')
    expect(mockDb.put).toHaveBeenCalledOnce()
  })

  it('replaces an existing variable when the key already exists', async () => {
    const env = makeEnvironment({
      variables: [makeKV('TOKEN', 'old-value')],
    })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    await store.upsertVariable(env.id, makeKV('TOKEN', 'new-value'))

    expect(store.environments[0].variables).toHaveLength(1)
    expect(store.environments[0].variables[0].value).toBe('new-value')
  })

  it('does nothing when the environment id is not found', async () => {
    const store = useEnvironmentsStore()
    await store.upsertVariable('ghost-id', makeKV('KEY', 'val'))

    expect(mockDb.put).not.toHaveBeenCalled()
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const env = makeEnvironment({ variables: [makeKV('EXISTING', 'value')] })
    mockDb.getAll.mockResolvedValue([env])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useEnvironmentsStore()
    await store.init()
    await store.upsertVariable(env.id, makeKV('NEW_KEY', 'new-val'))

    expect(store.environments[0].variables).toHaveLength(1)
    expect(store.environments[0].variables[0].key).toBe('EXISTING')
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to save variable')
  })
})

// ─── deleteVariable() ────────────────────────────────────────────────────────

describe('environmentsStore — deleteVariable()', () => {
  it('removes the variable matching the given key', async () => {
    const env = makeEnvironment({
      variables: [makeKV('KEEP', 'keep-val'), makeKV('REMOVE', 'remove-val')],
    })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    await store.deleteVariable(env.id, 'REMOVE')

    expect(store.environments[0].variables).toHaveLength(1)
    expect(store.environments[0].variables[0].key).toBe('KEEP')
    expect(mockDb.put).toHaveBeenCalledOnce()
  })

  it('does nothing when the environment id is not found', async () => {
    const store = useEnvironmentsStore()
    await store.deleteVariable('ghost-id', 'SOME_KEY')

    expect(mockDb.put).not.toHaveBeenCalled()
  })

  it('leaves state unchanged when the key does not exist in the environment', async () => {
    const env = makeEnvironment({ variables: [makeKV('ONLY', 'value')] })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    await store.deleteVariable(env.id, 'NON_EXISTENT')

    // idb is still called (store performs the write optimistically with the unchanged list)
    // but state should remain intact
    expect(store.environments[0].variables).toHaveLength(1)
    expect(store.environments[0].variables[0].key).toBe('ONLY')
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const env = makeEnvironment({ variables: [makeKV('A', '1'), makeKV('B', '2')] })
    mockDb.getAll.mockResolvedValue([env])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useEnvironmentsStore()
    await store.init()
    await store.deleteVariable(env.id, 'A')

    expect(store.environments[0].variables).toHaveLength(2)
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to delete variable')
  })
})

// ─── setJwtToken() ───────────────────────────────────────────────────────────

describe('environmentsStore — setJwtToken()', () => {
  it('stores a valid JWT token on the environment', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])
    const token = buildJwt(Math.floor(Date.now() / 1000) + 3600)

    const store = useEnvironmentsStore()
    await store.init()
    await store.setJwtToken(env.id, token)

    expect(store.environments[0].jwtToken).toBe(token)
    expect(mockDb.put).toHaveBeenCalledOnce()
  })

  it('throws synchronously for a token with fewer than three segments', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()

    await expect(store.setJwtToken(env.id, 'not.a.valid')).resolves.toBeUndefined()
    // A proper three-segment check; "not.a.valid" is actually three segments
    // so test with two-segment token instead
    await expect(store.setJwtToken(env.id, 'onlytwo.segments')).rejects.toThrow(
      'Invalid JWT format',
    )
  })

  it('throws for a completely malformed token (no dots)', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()

    await expect(store.setJwtToken(env.id, 'notajwtatall')).rejects.toThrow('Invalid JWT format')
    expect(mockDb.put).not.toHaveBeenCalled()
    expect(store.environments[0].jwtToken).toBeUndefined()
  })

  it('throws for a token with four segments', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()

    await expect(store.setJwtToken(env.id, 'a.b.c.d')).rejects.toThrow('Invalid JWT format')
  })

  it('does nothing when the environment id is not found', async () => {
    const store = useEnvironmentsStore()
    const token = buildJwt(Math.floor(Date.now() / 1000) + 3600)
    await store.setJwtToken('ghost-id', token)

    expect(mockDb.put).not.toHaveBeenCalled()
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))
    const token = buildJwt(Math.floor(Date.now() / 1000) + 3600)

    const store = useEnvironmentsStore()
    await store.init()
    await store.setJwtToken(env.id, token)

    expect(store.environments[0].jwtToken).toBeUndefined()
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to save JWT token')
  })
})

// ─── clearJwtToken() ─────────────────────────────────────────────────────────

describe('environmentsStore — clearJwtToken()', () => {
  it('removes jwtToken from the environment on success', async () => {
    const token = buildJwt(Math.floor(Date.now() / 1000) + 3600)
    const env = makeEnvironment({ jwtToken: token })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    await store.clearJwtToken(env.id)

    expect(store.environments[0].jwtToken).toBeUndefined()
    expect(mockDb.put).toHaveBeenCalledOnce()
  })

  it('is a no-op when the environment has no jwtToken', async () => {
    const env = makeEnvironment()
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()
    await store.clearJwtToken(env.id)

    expect(store.environments[0].jwtToken).toBeUndefined()
    expect(mockDb.put).toHaveBeenCalledOnce() // still writes (idempotent)
  })

  it('does nothing when the environment id is not found', async () => {
    const store = useEnvironmentsStore()
    await store.clearJwtToken('ghost-id')

    expect(mockDb.put).not.toHaveBeenCalled()
  })

  it('leaves state unchanged and calls showError when idb throws', async () => {
    const token = buildJwt(Math.floor(Date.now() / 1000) + 3600)
    const env = makeEnvironment({ jwtToken: token })
    mockDb.getAll.mockResolvedValue([env])
    mockDb.put.mockRejectedValue(new Error('idb write failed'))

    const store = useEnvironmentsStore()
    await store.init()
    await store.clearJwtToken(env.id)

    expect(store.environments[0].jwtToken).toBe(token)
    expect(mockShowError).toHaveBeenCalledOnce()
    expect(mockShowError.mock.calls[0][0]).toContain('Failed to clear JWT token')
  })
})

// ─── idb failure — general pattern ───────────────────────────────────────────

describe('environmentsStore — idb failure invariant', () => {
  it('never partially mutates state: environment count unchanged after failed createEnvironment', async () => {
    mockDb.put.mockRejectedValue(new Error('disk full'))

    const store = useEnvironmentsStore()
    const before = store.environments.length
    await store.createEnvironment('Partial')

    expect(store.environments.length).toBe(before)
  })

  it('shows an error message for every failing mutating CRUD action', async () => {
    mockDb.put.mockRejectedValue(new Error('fail'))
    mockDb.delete.mockRejectedValue(new Error('fail'))

    const token = buildJwt(Math.floor(Date.now() / 1000) + 3600)
    const env = makeEnvironment({
      variables: [makeKV('X', '1')],
      jwtToken: token,
    })
    mockDb.getAll.mockResolvedValue([env])

    const store = useEnvironmentsStore()
    await store.init()

    await store.createEnvironment('New')
    await store.renameEnvironment(env.id, 'Renamed')
    await store.deleteEnvironment(env.id)
    await store.upsertVariable(env.id, makeKV('Y', '2'))
    await store.deleteVariable(env.id, 'X')
    await store.setJwtToken(env.id, token)
    await store.clearJwtToken(env.id)

    expect(mockShowError).toHaveBeenCalledTimes(7)
  })
})
