# Implementation Plan: API Collection Manager

## Overview

Implementation is broken into eight incremental phases: project scaffold → data layer → service functions with property tests → Pinia stores → shared UI components → feature components → modals → integration wiring. Each phase produces runnable, tested code before the next phase begins. All code is TypeScript; tests run with Vitest + fast-check (minimum 100 iterations per property test).

## Tasks

- [x] 1. Project scaffold and type definitions
  - Initialise the Vite + Vue 3 + TypeScript project; install all required dependencies: `pinia`, `tailwindcss`, `@headlessui/vue`, `@monaco-editor/loader`, `idb`, `vuedraggable`, `fast-check`, `js-yaml`, `axios`; configure Vitest with `@vue/test-utils` and jsdom environment.
  - Create `src/types/index.ts` with all shared types: `HttpMethod`, `KeyValue`, `Request`, `Folder`, `Collection`, `Environment`.
  - Create `src/utils/uuid.ts` (`crypto.randomUUID()` wrapper) and `src/utils/download.ts` (browser file-download helper).
  - Configure Tailwind and `postcss.config.js`.
  - _Requirements: 1.1, 8.1, 9.6_

- [x] 2. IndexedDB layer
  - [x] 2.1 Implement `src/db/index.ts`
    - Call `openDB('api-collection-manager', 1, { upgrade })` creating `collections` and `environments` object stores with `keyPath: 'id'`.
    - Export the resolved `db` promise for use in stores.
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 2.2 Implement `src/db/migrations.ts`
    - Write a versioned upgrade helper that applies incremental migration steps inside the `idb` upgrade callback; version-1 step is a no-op (stores already created in `index.ts`).
    - _Requirements: 8.5_

  - [x] 2.3 Write integration test: IndexedDB initialisation
    - Seed idb with fixture data, initialise the db module, assert both object stores exist and seeded documents are retrievable.
    - _Requirements: 8.3_

  - [x] 2.4 Write integration test: schema migration
    - Seed v1 data, invoke the v2 upgrade callback, assert all v1 documents are preserved unchanged.
    - _Requirements: 8.5_

- [x] 3. Service: Variable Substitution
  - [x] 3.1 Implement `src/services/variableSubstitution.ts`
    - Export `interpolate(template: string, variables: KeyValue[]): { result: string; unresolved: Set<string> }`.
    - Use regex `/\{\{([^}]+)\}\}/g`; only substitute entries where `enabled === true`; leave unmatched tokens unchanged.
    - _Requirements: 2.3, 2.12, 4.5, 4.6_

  - [x] 3.2 Write unit tests for `variableSubstitution`
    - Cover: known substitutions, missing keys, disabled entries, nested-brace-like strings, empty variables array, empty template.
    - _Requirements: 2.3, 4.5, 4.6_

  - [x] 3.3 Write property test — Property 1: Variable Substitution Replaces All Matching Tokens
    - // Feature: postman, Property 1: Variable Substitution Replaces All Matching Tokens
    - Generate arbitrary templates with injected `{{key}}` tokens and matching enabled variable arrays; assert no `{{key}}` remains in result for any matched key; assert calling `interpolate` a second time on the result is idempotent.
    - Run minimum 100 iterations.
    - **Property 1: Variable Substitution Replaces All Matching Tokens**
    - **Validates: Requirements 2.3, 2.12, 4.5**

  - [x] 3.4 Write property test — Property 2: Unresolved Tokens Are Preserved Unchanged
    - // Feature: postman, Property 2: Unresolved Tokens Are Preserved Unchanged
    - Generate templates containing `{{token}}` keys that are guaranteed absent from (or disabled in) the variable array; assert the original `{{token}}` substring appears unchanged in the output.
    - Run minimum 100 iterations.
    - **Property 2: Unresolved Tokens Are Preserved Unchanged**
    - **Validates: Requirements 4.6**

- [x] 4. Service: JWT Decoder
  - [x] 4.1 Implement `src/services/jwtDecoder.ts`
    - Export `decodeJwt(token: string): JwtInfo`.
    - Split on `.`; return `{ valid: false }` if segment count ≠ 3 or payload is not valid JSON.
    - Decode base64url second segment, JSON-parse, extract `exp`; compute `isExpired` and `isExpiringSoon` (< 5 min).
    - _Requirements: 5.4, 5.6, 5.7_

  - [x] 4.2 Write unit tests for `jwtDecoder`
    - Cover: valid JWT (future `exp`), expired JWT, token expiring in < 5 min, missing `exp` claim, malformed segments, empty string, non-base64 payload.
    - _Requirements: 5.4, 5.6, 5.7_

  - [x] 4.3 Write property test — Property 4: JWT Decoding Correctness
    - // Feature: postman, Property 4: JWT Decoding Correctness
    - Generate arbitrary strings that are not three-dot-separated valid-JSON-payload JWTs; assert `valid: false`. Generate well-formed JWTs with arbitrary integer `exp`; assert `valid: true`, `expiresAt`, `isExpired`, `isExpiringSoon` are computed correctly.
    - Run minimum 100 iterations.
    - **Property 4: JWT Decoding Correctness**
    - **Validates: Requirements 5.4, 5.6, 5.7**

- [x] 5. Service: Code Generator
  - [x] 5.1 Implement `src/services/codeGenerator.ts`
    - Export `generateSnippet(request: Request, activeEnv: Environment | null, target: CodeTarget): string`.
    - Apply `interpolate()` on all request fields; inject auth header (bearer valid non-expired JWT, or basic base64); delegate to 22 pure builder functions.
    - **Original (5):** `buildCurl` (`curl`), `buildPhpCurl` (`<?php`), `buildLaravel` (`Http::`), `buildJsFetch` (`fetch(`), `buildAxios` (`axios(`).
    - **Backend languages (9):** `buildPythonRequests` (`requests.`), `buildPythonHttpx` (`httpx.`), `buildRubyNetHttp` (`Net::HTTP`), `buildRubyFaraday` (`Faraday`), `buildGoNetHttp` (`http.NewRequest`), `buildJavaOkHttp` (`OkHttpClient`), `buildJavaUnirest` (`Unirest.`), `buildCsharpHttpClient` (`HttpClient`), `buildRustReqwest` (`reqwest::`).
    - **JS ecosystem (3):** `buildNodeFetch` (`node-fetch`), `buildGot` (`got.`), `buildKy` (`ky.`).
    - **Mobile (2):** `buildSwiftUrlSession` (`URLSession`), `buildKotlinOkHttp` (`OkHttpClient`).
    - **Other (3):** `buildDartHttp` (`http.Request`), `buildRHttr` (`httr::`), `buildPowerShell` (`Invoke-WebRequest`).
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7_

  - [x] 5.2 Write unit tests for `codeGenerator`
    - One example per target (all 22); test auth injection (bearer, basic, none); test each body type (json, form, x-www-form-urlencoded); test variable substitution applied to URL and headers.
    - _Requirements: 7.1, 7.2, 7.3, 7.7_

  - [x] 5.3 Write property test — Property 5: Code Generator Covers All Targets
    - // Feature: postman, Property 5: Code Generator Covers All Targets With Language-Appropriate Output
    - Generate arbitrary valid `Request` objects; assert `generateSnippet` returns a non-empty string for all 22 `CodeTarget` values, each containing its expected structural token.
    - Run minimum 100 iterations.
    - **Property 5: Code Generator Covers All Targets With Language-Appropriate Output**
    - **Validates: Requirements 7.1, 7.7**

  - [x] 5.4 Write property test — Property 12: Code Generator Applies Variable Substitution
    - // Feature: postman, Property 12: Code Generator Applies Variable Substitution
    - Generate requests containing `{{key}}` tokens in URL, headers, and body, paired with matching environment variables; assert generated snippet contains no unresolved `{{key}}` for any matched key.
    - Run minimum 100 iterations.
    - **Property 12: Code Generator Applies Variable Substitution**
    - **Validates: Requirements 7.2**

- [x] 6. Service: Import / Export
  - [x] 6.1 Implement `src/services/importExport.ts`
    - Export `serializeCollection`, `deserializeCollection`, `importPostmanV21`, `importOpenApi`.
    - `deserializeCollection`: JSON-parse + structural validation; throw `ImportError` on failure.
    - `importPostmanV21`: map Postman `item[]` tree to `Collection`; assign new UUIDs for all nodes.
    - `importOpenApi`: use `js-yaml` to parse YAML; walk `paths` → one `Request` per operation; throw `ImportError` for unsupported/invalid files.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.2 Write unit tests for `importExport`
    - Native round-trip with a fixture collection; Postman v2.1 fixture parse; OpenAPI 3.x YAML fixture parse; invalid JSON throws `ImportError`; invalid Postman structure throws `ImportError`.
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [x] 6.3 Write property test — Property 3: Collection Export–Import Round-Trip
    - // Feature: postman, Property 3: Collection Export–Import Round-Trip
    - Generate arbitrary valid `Collection` objects with nested folders and requests using `fc.record`; assert `deserializeCollection(serializeCollection(c))` is deeply equal to the original.
    - Run minimum 100 iterations.
    - **Property 3: Collection Export–Import Round-Trip**
    - **Validates: Requirements 6.2, 6.6**

  - [x] 6.4 Write integration test: Postman v2.1 import
    - Load a real Postman v2.1 JSON fixture file; call `importPostmanV21`; assert collection name, folder structure, request method/URL fields are correctly mapped.
    - _Requirements: 6.3_

  - [x] 6.5 Write integration test: OpenAPI 3.x import
    - Load a real OpenAPI 3.x YAML fixture file; call `importOpenApi`; assert each path/operation maps to a `Request` with correct method and URL.
    - _Requirements: 6.4_

- [x] 7. Checkpoint — ensure all service unit and property tests pass
  - Run `vitest --run`; confirm zero failures before proceeding to store layer. Ask the user if any questions arise.

- [ ] 8. Pinia stores
  - [x] 8.1 Implement `src/stores/collections.ts`
    - State: `collections: Collection[]`.
    - Actions: `init()` (load all from idb), `createCollection(name)`, `renameCollection(id, name)`, `deleteCollection(id)`, `createFolder(collectionId, parentFolderId | null, name)`, `renameFolder(id, name)`, `deleteFolder(id)`, `updateRequest(request)`, `moveItem(dragEvent)`.
    - All mutating actions: write to idb first, then update state on success; on idb error call `uiStore.showError()` and leave state unchanged (Property 9 invariant).
    - `createCollection` assigns a `crypto.randomUUID()` id, empty `folders: []`, empty `requests: []`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 8.2 Write unit tests for `collectionsStore`
    - Mock `idb`; test each CRUD action updates state correctly; test idb-failure path leaves state unchanged; test `deleteCollection` removes all descendant ids from state.
    - _Requirements: 1.2, 1.3, 1.4, 1.7, 1.9_

  - [x] 8.3 Write property test — Property 7: Entity Factory Structural Invariants
    - // Feature: postman, Property 7: Entity Factory Structural Invariants
    - Generate arbitrary non-empty name strings; assert `createCollection(name)` produces valid UUID `id`, correct `name`, `folders: []`, `requests: []`. Same for `createEnvironment(name)`.
    - Run minimum 100 iterations.
    - **Property 7: Entity Factory Structural Invariants**
    - **Validates: Requirements 1.2, 4.1**

  - [x] 8.4 Write property test — Property 8: Deletion Removes All Descendants
    - // Feature: postman, Property 8: Deletion Removes All Descendants
    - Generate arbitrarily nested `Collection` objects; call `deleteCollection(id)`; assert no descendant folder or request id from the original subtree remains in store state. Repeat for `deleteFolder`.
    - Run minimum 100 iterations.
    - **Property 8: Deletion Removes All Descendants**
    - **Validates: Requirements 1.4, 1.7**

  - [x] 8.5 Write property test — Property 9: Storage Failure Preserves In-Memory State
    - // Feature: postman, Property 9: Storage Failure Preserves In-Memory State
    - Mock idb to throw on every write; dispatch arbitrary mutating actions; assert Pinia state is bit-for-bit identical to pre-action state for all mutation types.
    - Run minimum 100 iterations.
    - **Property 9: Storage Failure Preserves In-Memory State**
    - **Validates: Requirements 1.9**

  - [x] 8.6 Implement `src/stores/environments.ts`
    - State: `environments: Environment[]`, `activeId: string | null`.
    - Actions: `init()`, `createEnvironment(name)`, `renameEnvironment(id, name)`, `deleteEnvironment(id)`, `setActive(id)`, `upsertVariable(envId, kv)`, `deleteVariable(envId, key)`, `setJwtToken(envId, token)`, `clearJwtToken(envId)`.
    - Getter: `activeEnvironment: Environment | null`, `resolvedVariables: KeyValue[]`.
    - Same idb-first write pattern as collectionsStore.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 8.1_

  - [x] 8.7 Write unit tests for `environmentsStore`
    - Test CRUD actions, `setActive`, JWT set/clear, idb-failure path.
    - _Requirements: 4.1, 5.1, 5.2_

  - [x] 8.8 Implement `src/stores/ui.ts`
    - State: `activeRequestId: string | null`, `unsavedChanges: boolean`, `openModal: 'environments' | 'codeGenerator' | 'importExport' | null`, `lastResponse: SendResult | null`, `loading: boolean`, `errorMessage: string | null`.
    - Actions: `setActiveRequest(id)`, `setUnsaved(flag)`, `openModal(name)`, `closeModal()`, `setResponse(r)`, `setLoading(flag)`, `showError(msg)`, `clearError()`.
    - _Requirements: 9.3, 9.4, 9.5_

  - [x] 8.9 Write integration test: store initialisation from IndexedDB
    - Seed idb with fixture collections and environments; call `collectionsStore.init()` and `environmentsStore.init()`; assert Pinia state matches seeded data before any component mounts.
    - _Requirements: 8.3_

- [x] 9. Service: HTTP Client
  - [x] 9.1 Implement `src/services/httpClient.ts`
    - Export `sendRequest(request: Request, activeEnv: Environment | null): Promise<SendResult>`.
    - Deep-clone request; apply `interpolate()` to URL, all header values, body content; inject `Authorization` header per auth type (bearer with non-expired JWT, basic with base64); dispatch via `axios`; compute `timeMs`; map to `SendResult`; catch `AxiosError` → `{ status: 0, body: errorMessage }`.
    - _Requirements: 2.3, 2.12, 5.3, 5.6, 8.4_

  - [x] 9.2 Write unit tests for `httpClient`
    - Mock axios; test bearer injection with valid JWT; test bearer NOT injected with expired JWT; test basic auth base64; test variable substitution applied before dispatch; test AxiosError maps to status 0.
    - _Requirements: 2.12, 5.3, 5.6_

  - [x] 9.3 Write property test — Property 10: Bearer Token Injection Follows JWT Validity
    - // Feature: postman, Property 10: Bearer Token Injection Follows JWT Validity
    - Generate valid non-expired JWTs and expired JWTs via `fc`; assert axios call args contain `Authorization: Bearer` when non-expired and omit it when expired, for any generated `Request` with `auth.type === 'bearer'`.
    - Run minimum 100 iterations.
    - **Property 10: Bearer Token Injection Follows JWT Validity**
    - **Validates: Requirements 5.3, 5.6**

- [x] 10. Checkpoint — ensure all store and HTTP client tests pass
  - Run `vitest --run`; confirm zero failures before proceeding to UI components. Ask the user if any questions arise.

- [ ] 11. Shared UI components
  - [x] 11.1 Implement `src/components/shared/KeyValueEditor.vue`
    - Accept `modelValue: KeyValue[]`, `allowToggle`, `keyPlaceholder`, `valuePlaceholder` props.
    - Render rows with key/value inputs and optional enable-checkbox; "+" button appends empty row; delete button removes row; emit `update:modelValue` on every change.
    - _Requirements: 2.7, 4.4_

  - [x] 11.2 Write component tests for `KeyValueEditor`
    - Test add row, remove row, toggle enabled checkbox, `update:modelValue` emit value correctness.
    - _Requirements: 2.7, 4.4_

  - [x] 11.3 Implement `src/components/shared/MonacoEditor.vue`
    - Wrap `@monaco-editor/loader`; accept `modelValue`, `language`, `readOnly` props; emit `update:modelValue`; render a `<textarea>` fallback if Monaco fails to load.
    - _Requirements: 2.9, 7.4_

  - [x] 11.4 Implement `src/components/shared/JsonTree.vue`
    - Recursive component; leaf nodes for string/number/boolean/null; expandable nodes for object/array (collapsed by default at depth > 2); accepts `data`, `depth`, `label` props.
    - _Requirements: 3.3_

  - [x] 11.5 Implement `src/components/shared/Notification.vue`
    - Displays `uiStore.errorMessage`; auto-dismisses after 5 s; supports manual close.
    - _Requirements: 1.9_

- [x] 12. Application shell components
  - [x] 12.1 Implement `src/components/shell/AppTopbar.vue`
    - Show application name; render environment switcher `<select>` populated from `environmentsStore.environments` plus "No Environment"; on change call `environmentsStore.setActive(id)`; render buttons to open Environments Modal, Import/Export Modal.
    - _Requirements: 4.2, 4.3, 9.2_

  - [x] 12.2 Write component tests for `AppTopbar`
    - Assert switcher lists all environments + "No Environment"; selecting an env calls `setActive`; button click sets correct `uiStore.openModal`.
    - _Requirements: 4.2, 4.3_

  - [x] 12.3 Implement `src/components/shell/CollectionTree.vue`
    - Recursive tree node component; expand/collapse collections and folders; click on request calls `uiStore.setActiveRequest(id)`; emit `contextmenu` events for rename/delete; use `vuedraggable` to wrap request and folder lists, calling `collectionsStore.moveItem()` on drop.
    - _Requirements: 1.8, 9.1, 9.3_

  - [x] 12.4 Implement `src/components/shell/AppSidebar.vue`
    - Compose `<CollectionTree>`; render "New Collection" inline input at top; on submit call `collectionsStore.createCollection(name)`.
    - _Requirements: 1.2, 9.1_

- [ ] 13. Request Builder
  - [ ] 13.1 Implement `src/components/request/RequestBuilder.vue` (shell + URL bar)
    - Read `uiStore.activeRequestId`; deep-clone into `draftRequest` ref; compute `isDirty` and sync to `uiStore.unsavedChanges`; render method `<select>` (GET/POST/PUT/PATCH/DELETE), URL input with `{{variable}}` overlay highlighting; render tab bar (Params / Headers / Body / Auth); Send button calls `sendRequest` then `uiStore.setResponse`; Save button calls `collectionsStore.updateRequest`.
    - _Requirements: 2.1, 2.2, 2.12, 2.13, 9.3, 9.4, 9.5_

  - [ ] 13.2 Implement `src/components/request/ParamsTab.vue`
    - Render `<KeyValueEditor>` bound to URL query params; `watchEffect` syncs query string ↔ rows bidirectionally.
    - _Requirements: 2.4, 2.5, 2.6_

  - [ ]* 13.3 Write property test — Property 6: Query String ↔ Params Round-Trip
    - // Feature: postman, Property 6: Query String ↔ Params Round-Trip
    - Generate arbitrary arrays of URL-safe `KeyValue` pairs; serialise to query string and parse back; assert resulting key-value set is equivalent to the original.
    - Run minimum 100 iterations.
    - **Property 6: Query String ↔ Params Round-Trip**
    - **Validates: Requirements 2.5, 2.6**

  - [ ] 13.4 Implement `src/components/request/HeadersTab.vue`
    - Render `<KeyValueEditor allowToggle>` bound to `draftRequest.headers`.
    - _Requirements: 2.7_

  - [ ] 13.5 Implement `src/components/request/BodyTab.vue`
    - Render mode `<select>` (json / form / x-www-form-urlencoded); when `json` render `<MonacoEditor language="json">`; when form render `<KeyValueEditor>`; emit changes to parent via `v-model`.
    - _Requirements: 2.8, 2.9_

  - [ ] 13.6 Implement `src/components/request/AuthTab.vue`
    - Render auth type `<select>` (none / bearer / basic); for bearer show token field pre-populated from `environmentsStore.activeEnvironment.jwtToken`; show JWT expiry warning/expired badge when applicable; for basic show username + password fields.
    - _Requirements: 2.10, 2.11, 5.3, 5.5_

  - [ ]* 13.7 Write component tests for `RequestBuilder`
    - Test URL ↔ Params tab synchronisation; dirty flag sets when URL changes; Send button dispatches `httpClient.sendRequest`; method selector renders five options; auth type selector renders three options.
    - _Requirements: 2.1, 2.5, 2.6, 9.5_

- [ ] 14. Response Viewer
  - [ ] 14.1 Implement `src/components/response/ResponseBody.vue`
    - Read `uiStore.lastResponse`; when body is valid JSON render `<JsonTree>`; otherwise render plain text; render copy button calling `navigator.clipboard.writeText`.
    - _Requirements: 3.3, 3.4, 3.6_

  - [ ] 14.2 Implement `src/components/response/ResponseHeaders.vue`
    - Render response headers as a read-only key-value list.
    - _Requirements: 3.5_

  - [ ] 14.3 Implement `src/components/response/ResponseViewer.vue`
    - Compose `<ResponseBody>` and `<ResponseHeaders>` tabs; display status code + status text + `timeMs`; show loading spinner while `uiStore.loading`; show error message when `status === 0`.
    - _Requirements: 3.1, 3.2, 3.7, 3.8_

  - [ ]* 14.4 Write component tests for `ResponseViewer`
    - Test status/time render; JSON branch renders `<JsonTree>`; plain text branch; loading spinner visible; network error message; copy button calls clipboard API.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8_

- [ ] 15. Modals
  - [ ] 15.1 Implement `src/components/modals/EnvironmentsModal.vue`
    - List environments in sidebar; selecting one shows `<KeyValueEditor>` for variables and JWT token input; JWT input shows green / amber / red badge from `decodeJwt`; "Set Active" calls `environmentsStore.setActive`; save/clear JWT calls `environmentsStore.setJwtToken` / `clearJwtToken`; reject and show error for invalid JWT format.
    - _Requirements: 4.4, 5.1, 5.2, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 15.2 Write component tests for `EnvironmentsModal`
    - Test JWT badge states (valid, warning < 5 min, expired, invalid format); set JWT token calls store; clear token calls store; `setActive` called on button click.
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

  - [ ] 15.3 Implement `src/components/modals/CodeGeneratorModal.vue`
    - Language tabs: cURL / PHP cURL / Laravel / JS fetch / Axios; on tab change call `generateSnippet(activeRequest, activeEnv, target)` and bind result to read-only `<MonacoEditor>`; copy button calls `navigator.clipboard.writeText`; show "Could not copy" toast on clipboard failure.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 15.4 Write component tests for `CodeGeneratorModal`
    - Test Monaco renders in read-only mode; tab change updates snippet; copy button calls clipboard API.
    - _Requirements: 7.4, 7.5, 7.6_

  - [ ] 15.5 Implement `src/components/modals/ImportExportModal.vue`
    - Export tab: list collections, click triggers `serializeCollection` + `download.ts`; Import tab: file input accepting JSON/YAML, on file load detect format (Postman v2.1 vs OpenAPI vs native) and call appropriate import function; deduplicate names with numeric suffix; display `ImportError.message` on failure; do not modify Storage on error.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

  - [ ]* 15.6 Write property test — Property 11: Import Name Deduplication
    - // Feature: postman, Property 11: Import Name Deduplication
    - Generate a collection name and an integer `N` (0–5) representing existing duplicates already in the store; assert the imported collection receives name `"<name> (N+1)"` and all existing collections are unmodified.
    - Run minimum 100 iterations.
    - **Property 11: Import Name Deduplication**
    - **Validates: Requirements 6.7**

- [ ] 16. Root layout wiring and application entry point
  - [ ] 16.1 Implement `src/App.vue`
    - Compose `<AppTopbar>`, `<AppSidebar>`, `<RequestBuilder>`, `<ResponseViewer>`, and all three modals via `<Teleport to="body">`; show modals conditionally based on `uiStore.openModal`; show `<Notification>` for error messages.
    - Call `collectionsStore.init()` and `environmentsStore.init()` in `onMounted` and block rendering of the sidebar until both resolve.
    - _Requirements: 8.3, 9.1, 9.2_

  - [ ] 16.2 Implement `src/main.ts`
    - Create Vue app; register Pinia; mount to `#app`.
    - _Requirements: 9.6_

  - [ ]* 16.3 Write smoke test: sole persistence mechanism
    - Assert all store mutating actions return a `Promise`; spy on `localStorage.setItem` and `sessionStorage.setItem` and assert neither is called during any store action.
    - _Requirements: 8.1, 8.2_

  - [ ]* 16.4 Write smoke test: single active request
    - Simulate opening three requests sequentially via `uiStore.setActiveRequest`; assert `uiStore.activeRequestId` equals the last-opened request id.
    - _Requirements: 9.4_

- [ ] 17. Final checkpoint — full test suite
  - Run `vitest --run`; confirm all unit, property, component, integration, and smoke tests pass. Fix any failures before considering implementation complete. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP build.
- Property test files must include the tag comment `// Feature: postman, Property N: <title>` and run at minimum 100 iterations via fast-check.
- The `*` tasks cover all 12 correctness properties defined in the design document — none should be skipped in a quality build.
- Checkpoints at tasks 7, 10, and 17 act as integration gates; do not proceed past a checkpoint with failing tests.
- All idb writes in stores follow the pattern: write to idb first → mutate Pinia state on success → call `uiStore.showError` and leave state unchanged on failure.
- Monaco Editor must be mocked in component tests; test its actual load only in the smoke/integration suite.
