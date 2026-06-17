# Design Document: API Collection Manager

## Overview

The API Collection Manager is a Vue 3 SPA that replicates the core workflow of tools like Postman — entirely in the browser, with no backend. All persistence is handled by IndexedDB via the `idb` library. The application is composed of a persistent sidebar (collection tree), a persistent topbar (environment switcher), a main request-builder panel, and a response viewer. Modals cover environment management, code generation, and import/export.

**Design goals:**
- Keep all logic in the frontend; no HTTP calls except to the user's target APIs via axios.
- Reactive state managed by Pinia stores; UI components read from stores and dispatch actions.
- IndexedDB is the single source of truth for persistence; Pinia is the in-memory working state.
- Monaco Editor is used for JSON body editing and code-generation previews (read-only).
- Drag-and-drop reordering uses `@vueuse/core` or `vuedraggable` (no custom pointer-event logic needed).

---

## Architecture

The application follows a **unidirectional data flow** pattern:

```
IndexedDB (idb)
      ↕ async read/write
  Pinia Stores
      ↕ reactive refs / actions
  Vue 3 Components
      → User interactions → store actions → IndexedDB writes
```

### Top-Level Module Breakdown

```
src/
├── main.ts                   # App entry point, mounts app, registers plugins
├── App.vue                   # Root layout: Sidebar + Topbar + Main panel
├── stores/
│   ├── collections.ts        # Collection / Folder / Request CRUD + ordering
│   ├── environments.ts       # Environment + variable + JWT management
│   └── ui.ts                 # Active request, unsaved flag, modal open/close state
├── db/
│   ├── index.ts              # idb openDB, schema definition, upgrade callback
│   └── migrations.ts         # Versioned migration helpers
├── services/
│   ├── httpClient.ts         # axios wrapper: Variable_Substitution + send
│   ├── variableSubstitution.ts # Pure interpolation function
│   ├── jwtDecoder.ts         # Decode JWT payload, compute expiry, validate
│   ├── codeGenerator.ts      # Generate cURL / PHP / Laravel / fetch / axios snippets
│   └── importExport.ts       # Parse Postman v2.1, OpenAPI 3.x, Swagger 2.x; serialize native
├── components/
│   ├── shell/
│   │   ├── AppSidebar.vue
│   │   ├── AppTopbar.vue
│   │   └── CollectionTree.vue
│   ├── request/
│   │   ├── RequestBuilder.vue
│   │   ├── ParamsTab.vue
│   │   ├── HeadersTab.vue
│   │   ├── BodyTab.vue
│   │   └── AuthTab.vue
│   ├── response/
│   │   ├── ResponseViewer.vue
│   │   ├── ResponseBody.vue
│   │   └── ResponseHeaders.vue
│   ├── modals/
│   │   ├── EnvironmentsModal.vue
│   │   ├── CodeGeneratorModal.vue
│   │   └── ImportExportModal.vue
│   └── shared/
│       ├── KeyValueEditor.vue   # Reusable table of key-value rows with enable toggle
│       ├── MonacoEditor.vue     # Thin wrapper around Monaco
│       ├── JsonTree.vue         # Recursive collapsible JSON viewer
│       └── Notification.vue
└── utils/
    ├── uuid.ts                  # crypto.randomUUID() wrapper
    └── download.ts              # Trigger browser file download
```

### Routing

No client-side router is needed in MVP. The app is a single view; panel visibility is controlled by UI store state (active request ID, open modal).

### State Management

Three Pinia stores cover all reactive state:

| Store | Responsibility |
|---|---|
| `collectionsStore` | In-memory tree of all Collections/Folders/Requests; all CRUD and order mutations |
| `environmentsStore` | List of Environments, active environment ID, variable lookup, JWT storage |
| `uiStore` | Currently open request, unsaved flag, which modal is open, loading / error state |

---

## Components and Interfaces

### App.vue — Root Layout

```
┌─────────────────────────────────────────────────┐
│  AppTopbar (env switcher, app name, modal btns)  │
├──────────────┬──────────────────────────────────┤
│  AppSidebar  │  RequestBuilder + ResponseViewer │
│  (tree)      │  (main content area)             │
└──────────────┴──────────────────────────────────┘
```

`App.vue` simply composes `<AppTopbar>`, `<AppSidebar>`, and the main panel. Modals are rendered at root level via `<Teleport to="body">`.

---

### AppSidebar / CollectionTree

- Renders the recursive `CollectionTree` component.
- Each node (Collection, Folder, Request) is a `<CollectionTreeNode>` that emits contextmenu events for rename/delete.
- Drag-and-drop is handled by `vuedraggable` (wraps SortableJS). Each drop event calls `collectionsStore.moveItem()` which persists the new order.
- "New Collection" button at the top opens an inline input; on submit calls `collectionsStore.createCollection(name)`.

---

### RequestBuilder

Props: none (reads from `uiStore.activeRequestId` → looks up from `collectionsStore`).

Tabs: **Params**, **Headers**, **Body**, **Auth**.

Internal state (transient, not yet saved to DB):
- `draftRequest: Ref<Request>` — a deep clone of the store request, edited locally.
- `isDirty: ComputedRef<boolean>` — compares draft to the store snapshot; synced to `uiStore.unsavedChanges`.

Key interactions:
- URL field ↔ Params tab: a `watchEffect` keeps query string and rows in sync (bidirectional).
- Variable tokens (`{{…}}`) in the URL display field are highlighted via a computed overlay using regex.
- Send button calls `httpClient.send(resolvedRequest)` and writes result to `uiStore.lastResponse`.
- Save button calls `collectionsStore.updateRequest(draftRequest)`.

---

### BodyTab

- Displays a `<select>` for mode: `json` | `form` | `x-www-form-urlencoded`.
- When mode is `json`: renders `<MonacoEditor>` with `language="json"`.
- When mode is `form` or `x-www-form-urlencoded`: renders `<KeyValueEditor>`.

---

### MonacoEditor.vue

Thin wrapper:

```ts
// Props
interface MonacoEditorProps {
  modelValue: string
  language: 'json' | 'javascript' | 'php' | 'shell' | 'plaintext'
  readOnly?: boolean
}
```

Uses `@monaco-editor/loader` (CDN-free, bundled). Emits `update:modelValue` on content change. `readOnly` prop is used for the Code Generator viewer.

---

### JsonTree.vue

Recursive component that renders a collapsible JSON viewer.

```ts
interface JsonTreeProps {
  data: unknown    // parsed JSON value
  depth?: number   // current nesting depth (for indentation)
  label?: string   // key name from parent
}
```

Strings, numbers, booleans, and nulls are leaf nodes. Arrays and objects are expandable nodes (collapsed by default at depth > 2).

---

### KeyValueEditor.vue

Reusable editor for headers, query params, form-data, and environment variables.

```ts
interface KeyValueEditorProps {
  modelValue: KeyValue[]
  allowToggle?: boolean   // show enable/disable checkbox
  keyPlaceholder?: string
  valuePlaceholder?: string
}
```

Emits `update:modelValue` with a new array on every change. Rows can be added with "+" button and deleted per-row.

---

### EnvironmentsModal.vue

- Lists all environments in a sidebar list.
- Selecting an environment shows its `<KeyValueEditor>` and a JWT token field.
- JWT field shows: green checkmark (valid + not expiring), amber warning (< 5 min to expiry), red badge (expired), or red error (invalid format).
- "Set Active" button calls `environmentsStore.setActive(id)`.

---

### CodeGeneratorModal.vue

- Language tabs: cURL | PHP cURL | Laravel | JS fetch | Axios.
- On tab change, calls `codeGenerator.generate(request, env, language)` and displays result in a read-only `<MonacoEditor>`.
- Copy button uses `navigator.clipboard.writeText()`.

---

## Data Models

All persistent types are defined in `src/types/index.ts`:

```ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface KeyValue {
  key: string
  value: string
  enabled: boolean
}

export interface Request {
  id: string                            // crypto.randomUUID()
  name: string
  method: HttpMethod
  url: string                           // may contain {{variable}} tokens
  headers: KeyValue[]
  body: {
    type: 'json' | 'form' | 'x-www-form-urlencoded'
    content: string                     // raw JSON string or serialized form pairs
  }
  auth: {
    type: 'bearer' | 'basic' | 'none'
    token?: string
    username?: string
    password?: string
  }
}

export interface Folder {
  id: string
  name: string
  folders: Folder[]                     // recursive nesting
  requests: Request[]
}

export interface Collection {
  id: string
  name: string
  folders: Folder[]
  requests: Request[]
}

export interface Environment {
  id: string
  name: string
  variables: KeyValue[]
  jwtToken?: string                     // raw JWT string
}
```

### IndexedDB Schema

Database name: `api-collection-manager`, initial version: `1`.

| Object Store | Key Path | Indexes | Value |
|---|---|---|---|
| `collections` | `id` | — | `Collection` |
| `environments` | `id` | — | `Environment` |

All nested Folders and Requests are stored as part of their parent `Collection` document (document-model approach). This keeps the tree reads as a single `getAll()` call and avoids complex join logic.

```ts
// db/index.ts (simplified)
import { openDB } from 'idb'

export const db = openDB('api-collection-manager', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('collections')) {
      db.createObjectStore('collections', { keyPath: 'id' })
    }
    if (!db.objectStoreNames.contains('environments')) {
      db.createObjectStore('environments', { keyPath: 'id' })
    }
  },
})
```

### Schema Migration Strategy

Migrations are versioned inside the `upgrade` callback. When `newVersion === 2`, `idb` will call upgrade with `oldVersion === 1`; the callback applies incremental steps so upgrades from any older version are safe. No data is deleted during migrations — fields are added with defaults.

---

### Variable Substitution Service

```ts
// services/variableSubstitution.ts

/**
 * Replace every {{key}} token in `template` with the matching value
 * from `variables`. Tokens with no match are left unchanged.
 * Returns the substituted string and a set of unresolved token names.
 */
export function interpolate(
  template: string,
  variables: KeyValue[]
): { result: string; unresolved: Set<string> }
```

The regex used is `/\{\{([^}]+)\}\}/g`. Each captured group is looked up in the `variables` array (enabled entries only). This function is pure and side-effect-free — ideal for property testing.

---

### JWT Decoder Service

```ts
// services/jwtDecoder.ts

export interface JwtInfo {
  valid: boolean
  expiresAt?: Date
  isExpired: boolean
  isExpiringSoon: boolean   // within 5 minutes
}

export function decodeJwt(token: string): JwtInfo
```

Decodes by splitting on `.`, base64url-decoding the second segment, and JSON-parsing the claims. No signature verification. Returns `valid: false` if the token does not have exactly three dot-separated segments or if the payload is not valid JSON.

---

### HTTP Client Service

```ts
// services/httpClient.ts

export interface SendResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  timeMs: number
}

export async function sendRequest(
  request: Request,
  activeEnv: Environment | null
): Promise<SendResult>
```

Steps:
1. Deep clone request.
2. Run `interpolate()` on URL, each header value, and body content.
3. If auth type is `bearer` and env has a non-expired JWT, set `Authorization: Bearer <token>`.
4. If auth type is `basic`, set `Authorization: Basic <base64(user:pass)>`.
5. Dispatch via `axios`. Record `Date.now()` before and after.
6. Map axios response to `SendResult`.
7. On `AxiosError`, map to a descriptive `SendResult` with `status: 0` and error message in `body`.

---

### Code Generator Service

```ts
// services/codeGenerator.ts

export type CodeTarget = 'curl' | 'php-curl' | 'laravel' | 'js-fetch' | 'axios'

export function generateSnippet(
  request: Request,
  activeEnv: Environment | null,
  target: CodeTarget
): string
```

Steps:
1. Apply `interpolate()` to request fields.
2. Inject auth header if applicable (same logic as HTTP client).
3. Delegate to a target-specific builder function.
4. Return the code string.

Each target builder is a pure function: `(ResolvedRequest) => string`.

---

### Import / Export Service

```ts
// services/importExport.ts

// Native export
export function serializeCollection(collection: Collection): string  // JSON.stringify

// Native import
export function deserializeCollection(json: string): Collection      // JSON.parse + validate

// Postman v2.1 import
export function importPostmanV21(json: string): Collection

// OpenAPI 3.x / Swagger 2.x import
export function importOpenApi(yaml: string): Collection
```

`importPostmanV21` maps Postman's `item[]` tree to the `Collection` structure. `importOpenApi` uses the `js-yaml` library to parse YAML, then walks the `paths` object to create one `Request` per operation.

On any parse error, functions throw a typed `ImportError` with a human-readable `message` field, which the ImportExportModal catches and displays.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Variable Substitution Replaces All Matching Tokens

*For any* string template containing one or more `{{key}}` tokens, and any set of enabled key-value variables that contains a matching key, calling `interpolate(template, variables)` SHALL return a result string in which no `{{key}}` token remains for any key present in the variable set. Furthermore, calling `interpolate()` a second time on the result SHALL produce the same output (idempotence).

**Validates: Requirements 2.3, 2.12, 4.5**

---

### Property 2: Unresolved Tokens Are Preserved Unchanged

*For any* template string containing a `{{token}}` whose key is absent from the variable set (or where all matching entries are disabled), `interpolate()` SHALL return the original `{{token}}` substring unchanged in the output string.

**Validates: Requirements 4.6**

---

### Property 3: Collection Export–Import Round-Trip

*For any* valid `Collection` object (with arbitrary nesting of Folders and Requests), calling `serializeCollection(c)` followed by `deserializeCollection(json)` SHALL produce a collection that is deeply equal to the original — all field values, nested structures, and ordering preserved.

**Validates: Requirements 6.2, 6.6**

---

### Property 4: JWT Decoding Correctness

*For any* string that does not consist of exactly three dot-separated base64url-encoded segments where the second segment parses as valid JSON, `decodeJwt()` SHALL return `{ valid: false }`.

*For any* well-formed JWT string whose payload JSON contains a numeric `exp` field, `decodeJwt()` SHALL return `{ valid: true, expiresAt: new Date(exp * 1000), isExpired: expiresAt < now, isExpiringSoon: expiresAt - now < 5 minutes }`.

**Validates: Requirements 5.4, 5.6, 5.7**

---

### Property 5: Code Generator Covers All Targets With Language-Appropriate Output

*For any* `Request` with a valid HTTP method and URL, `generateSnippet(request, env, target)` SHALL return a non-empty string for each of the five `CodeTarget` values (`curl`, `php-curl`, `laravel`, `js-fetch`, `axios`), and each returned string SHALL contain a target-specific structural token (`curl` for cURL, `<?php` for PHP cURL, `Http::` for Laravel, `fetch(` for JS fetch, `axios(` for Axios).

**Validates: Requirements 7.1, 7.7**

---

### Property 6: Query String ↔ Params Round-Trip

*For any* array of `KeyValue` pairs (with non-empty, URL-safe keys and values), serialising them to a query string and then parsing that query string back into a `KeyValue[]` array SHALL produce a set of key-value pairs equivalent to the originals (same keys and values; order may differ).

**Validates: Requirements 2.5, 2.6**

---

### Property 7: Entity Factory Structural Invariants

*For any* non-empty name string, `createCollection(name)` SHALL produce a `Collection` with a valid UUID `id`, `name` equal to the input, `folders` equal to `[]`, and `requests` equal to `[]`. The same structural invariant SHALL hold for `createEnvironment(name)`: valid UUID `id`, correct `name`, `variables` equal to `[]`, and no `jwtToken`.

**Validates: Requirements 1.2, 4.1**

---

### Property 8: Deletion Removes All Descendants

*For any* `Collection` containing arbitrarily nested `Folder` and `Request` nodes, after calling `deleteCollection(id)` the `collectionsStore` SHALL contain no object whose `id` matches any id from the original collection's entire descendant tree (folders, sub-folders, requests at every level).

The same invariant SHALL hold for `deleteFolder(id)`: after deletion, no descendant folder or request id from that folder's subtree remains in the store.

**Validates: Requirements 1.4, 1.7**

---

### Property 9: Storage Failure Preserves In-Memory State

*For any* store mutation action (create, rename, delete, reorder) where the underlying `idb` operation throws an error, the in-memory Pinia state SHALL be identical to the state before the action was dispatched — no partial mutations are committed.

**Validates: Requirements 1.9**

---

### Property 10: Bearer Token Injection Follows JWT Validity

*For any* `Request` with auth type `bearer` and an `Environment` whose `jwtToken` decodes as non-expired (`isExpired === false`), calling `sendRequest(request, env)` SHALL include an `Authorization: Bearer <token>` header in the axios call arguments.

*For any* `Request` with auth type `bearer` and an `Environment` whose `jwtToken` decodes as expired (`isExpired === true`), `sendRequest` SHALL NOT include an `Authorization` header derived from the JWT.

**Validates: Requirements 5.3, 5.6**

---

### Property 11: Import Name Deduplication

*For any* `Collection` name that already appears `N` times in the store, importing a collection with that same name SHALL result in the newly created collection's `name` being `"<name> (N+1)"`, leaving all existing collections unmodified.

**Validates: Requirements 6.7**

---

### Property 12: Code Generator Applies Variable Substitution

*For any* `Request` containing `{{key}}` tokens in its URL, headers, or body, and an `Environment` with a matching variable for that key, `generateSnippet(request, env, target)` SHALL return a string that does not contain `{{key}}` for any key present in the environment's variable set.

**Validates: Requirements 7.2**

---

## Error Handling

| Scenario | Detection | User-Facing Response |
|---|---|---|
| IndexedDB write failure | `await` rejects in store action | Toast notification; in-memory state retained |
| HTTP request network error | `axios` throws `AxiosError` | Response Viewer shows error message |
| HTTP request timeout | `axios` timeout config | Response Viewer shows "Request timed out" |
| Invalid JWT format | `decodeJwt` returns `valid: false` | Red validation badge; token not stored |
| JWT expired | `decodeJwt` returns `isExpired: true` | Red "Expired" badge; token not injected |
| JWT expiring soon | `decodeJwt` returns `isExpiringSoon: true` | Amber "Expiring soon" badge |
| Unresolved `{{variable}}` | `interpolate()` returns non-empty `unresolved` set | Orange highlight on unresolved token in URL field |
| Import parse error | `importPostmanV21` / `importOpenApi` throws | Modal displays descriptive `ImportError.message` |
| Clipboard write denied | `navigator.clipboard.writeText` rejects | Toast: "Could not copy to clipboard" |
| Monaco load failure | `@monaco-editor/loader` promise rejects | Textarea fallback renders instead |

All async store actions follow the pattern:

```ts
try {
  await db.put('collections', updated)
  this.collections = updated   // mutate state only on success
} catch (err) {
  uiStore.showError('Failed to save. Please try again.')
}
```

---

## Testing Strategy

### Unit Tests (Vitest)

Focus on **pure service functions** where behaviour is deterministic:

| Module | Tests |
|---|---|
| `variableSubstitution.ts` | Known substitutions, missing keys, nested braces, enabled/disabled vars |
| `jwtDecoder.ts` | Valid JWT, expired JWT, malformed segments, missing `exp` claim |
| `codeGenerator.ts` | One example per target, auth injection, body types |
| `importExport.ts` | Native round-trip, Postman v2.1 fixture, OpenAPI fixture, invalid JSON |
| `collectionsStore` | CRUD actions with mocked idb |

### Property-Based Tests (fast-check)

Use **fast-check** (TypeScript-native, well-maintained) for universal property verification. Each test runs a **minimum of 100 iterations**.

| Property | Generator Strategy |
|---|---|
| Property 1 — Variable Substitution | `fc.string()` templates with injected `{{key}}` tokens; `fc.array(fc.record({key, value, enabled: fc.boolean()}))` |
| Property 2 — Unresolved Tokens Preserved | Templates with tokens guaranteed absent from the variable array |
| Property 3 — Collection Round-Trip | `fc.record(…)` shaped to produce valid `Collection` objects with nested folders/requests |
| Property 4 — JWT Decoding | `fc.string()` for invalid inputs; constructed valid JWTs with `fc.integer()` for `exp` claim |
| Property 5 — Code Generator All Targets | `fc.record(…)` for `Request`; assert all five `CodeTarget` values produce non-empty output with structural tokens |
| Property 6 — Query String Round-Trip | `fc.array(fc.record({key: fc.string(), value: fc.string()}))` mapped to URL query strings |
| Property 7 — Entity Factory Invariants | `fc.string({ minLength: 1 })` for name; assert UUID format and empty arrays |
| Property 8 — Deletion Removes Descendants | `fc.record(…)` for arbitrarily nested `Collection`; assert no descendant id survives deletion |
| Property 9 — Storage Failure Preserves State | Mock idb to throw; assert store state unchanged for any mutation action |
| Property 10 — Bearer Token Injection | Generated valid/expired JWTs; assert axios call args contain/omit `Authorization` accordingly |
| Property 11 — Import Name Deduplication | `fc.string()` name with `fc.integer({min:0, max:5})` existing duplicates; assert correct suffix |
| Property 12 — Code Generator Substitution | Requests with `{{tokens}}` and matching env; assert generated snippet contains no unresolved tokens |

Each property test file includes a tag comment:
```ts
// Feature: postman, Property N: <property text>
```

### Integration / Smoke Tests

- **IndexedDB init** (Integration): seed idb, init stores, assert Pinia state contains seeded data before mount. Validates Req 8.3.
- **Postman v2.1 import** (Integration): load a real Postman v2.1 fixture, assert the resulting Collection structure and request fields. Validates Req 6.3.
- **OpenAPI 3.x import** (Integration): load an OpenAPI 3.x YAML fixture, assert each path/operation maps to a `Request`. Validates Req 6.4.
- **Schema migration** (Integration): seed v1 data, trigger v2 upgrade callback, assert v1 data is preserved. Validates Req 8.5.
- **Sole persistence mechanism** (Smoke): assert all store actions return `Promise` (async); no `localStorage` or `sessionStorage` calls. Validates Req 8.1, 8.2.
- **Single active request** (Smoke): open multiple requests sequentially, assert only the last one is set as active. Validates Req 9.4.

### Component Tests (Vitest + @vue/test-utils)

- `KeyValueEditor`: add row, remove row, toggle enabled, `v-model` update event.
- `RequestBuilder`: URL ↔ Params sync, dirty flag, Send button dispatches `httpClient`, method selector has five options, auth type selector has three options.
- `EnvironmentsModal`: JWT badge states (valid, warning, expired, invalid format), set/clear token updates store.
- `ResponseViewer`: status/time render, JSON tree branch, plain text branch, loading spinner, network error message, copy button calls clipboard API.
- `AppTopbar`: environment switcher lists all envs + "No Environment" option; selecting an env updates `environmentsStore.activeId`.
- `CodeGeneratorModal`: Monaco renders as read-only, tab change updates snippet, copy button calls clipboard API.

### Testing Notes

- Property tests run with `vitest --run` (no watch mode) in CI.
- `idb` is mocked in unit/component tests using an in-memory implementation.
- Monaco Editor is mocked in component tests (heavy dependency, tested via smoke test separately).
