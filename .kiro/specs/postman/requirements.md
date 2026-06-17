# Requirements Document

## Introduction

The API Collection Manager is a lightweight, browser-based tool for composing, organizing, and executing HTTP API requests. It is a Vue 3 single-page application (SPA) with no backend server. All data is persisted locally in IndexedDB. The MVP covers request building, collection organization, environment variable management, JWT token handling, response viewing, import/export, and code generation. Cloud sync, authentication, and collaboration features are explicitly out of scope for the MVP.

## Glossary

- **Application**: The API Collection Manager Vue 3 SPA.
- **Collection**: A named, top-level container that groups Folders and Requests.
- **Folder**: A named sub-container within a Collection that groups Requests.
- **Request**: A saved HTTP API call definition including method, URL, headers, body, and auth config.
- **Request_Builder**: The UI panel where a Request is composed and sent.
- **Response_Viewer**: The UI panel that displays the result of a sent Request.
- **Environment**: A named set of key-value variable pairs (e.g., Local, Staging, Production).
- **Variable_Substitution**: The process of replacing `{{variable_name}}` placeholders in URLs, headers, and body content with the corresponding value from the active Environment.
- **Active_Environment**: The single Environment currently selected for Variable_Substitution.
- **JWT_Store**: The per-Environment storage for a JWT bearer token.
- **Code_Generator**: The modal UI that produces equivalent code snippets for a Request.
- **Storage**: The IndexedDB database managed via the `idb` library.
- **Sidebar**: The left-hand panel containing the Collections tree.
- **Topbar**: The fixed header bar containing the Active_Environment switcher.
- **KeyValue**: A pair of `{ key: string; value: string }` entries used for headers, query parameters, and environment variables.

---

## Requirements

### Requirement 1: Collection Management

**User Story:** As a developer, I want to create, rename, delete, and organize collections so that I can group related API requests logically.

#### Acceptance Criteria

1. THE Application SHALL persist all Collections, Folders, and Requests in Storage (IndexedDB) so that data survives page reloads.
2. WHEN a user submits a new collection name, THE Application SHALL create a Collection with a unique UUID, an empty `folders` array, and an empty `requests` array.
3. WHEN a user renames a Collection, THE Application SHALL update the Collection's `name` field in Storage and reflect the change in the Sidebar immediately.
4. WHEN a user deletes a Collection, THE Application SHALL remove the Collection and all of its Folders and Requests from Storage.
5. WHEN a user creates a Folder inside a Collection or another Folder, THE Application SHALL insert the Folder into the correct parent's `folders` array in Storage.
6. WHEN a user renames a Folder, THE Application SHALL update the Folder's `name` field in Storage and reflect the change in the Sidebar immediately.
7. WHEN a user deletes a Folder, THE Application SHALL remove the Folder and all Requests nested within it from Storage.
8. WHEN a user drags a Request or Folder to a new position in the Sidebar, THE Application SHALL persist the updated order to Storage.
9. IF a Storage write operation fails, THEN THE Application SHALL display an error notification to the user without losing the in-memory state.

---

### Requirement 2: Request Builder

**User Story:** As a developer, I want to compose HTTP requests with full control over method, URL, headers, query parameters, and body so that I can test any API endpoint.

#### Acceptance Criteria

1. THE Request_Builder SHALL provide a method selector supporting GET, POST, PUT, PATCH, and DELETE.
2. THE Request_Builder SHALL provide a URL input field that accepts absolute URLs and `{{variable_name}}` placeholders.
3. WHEN the Active_Environment is set, THE Request_Builder SHALL resolve `{{variable_name}}` placeholders in the URL field using Variable_Substitution before sending the request.
4. THE Request_Builder SHALL provide a Query Params tab displaying all query parameters as editable KeyValue rows.
5. WHEN a user edits a query parameter key or value in the Query Params tab, THE Request_Builder SHALL synchronize the URL input field to reflect the updated query string.
6. WHEN a user edits the URL query string directly in the URL input field, THE Request_Builder SHALL synchronize the Query Params tab rows to reflect the parsed parameters.
7. THE Request_Builder SHALL provide a Headers tab displaying request headers as editable KeyValue rows.
8. THE Request_Builder SHALL provide a Body tab with three sub-modes: `json` (Monaco Editor), `form-data` (KeyValue rows), and `x-www-form-urlencoded` (KeyValue rows).
9. WHEN the body sub-mode is `json`, THE Request_Builder SHALL display a Monaco Editor instance pre-configured for JSON syntax highlighting and formatting.
10. THE Request_Builder SHALL provide an Auth tab with options: `none`, `bearer`, and `basic`.
11. WHEN the auth type is `bearer`, THE Request_Builder SHALL pre-populate the token field from the JWT_Store for the Active_Environment, if a token is stored.
12. WHEN a user clicks the Send button, THE Request_Builder SHALL perform Variable_Substitution on the URL, all header values, and the body content before dispatching the HTTP request via axios.
13. WHEN a user saves a Request, THE Request_Builder SHALL persist all fields (method, url, headers, body, auth) to Storage under the parent Collection or Folder.

---

### Requirement 3: Response Viewer

**User Story:** As a developer, I want to inspect API responses clearly so that I can understand what the server returned.

#### Acceptance Criteria

1. WHEN an HTTP response is received, THE Response_Viewer SHALL display the HTTP status code and status text.
2. WHEN an HTTP response is received, THE Response_Viewer SHALL display the total response time in milliseconds.
3. WHEN an HTTP response body is valid JSON, THE Response_Viewer SHALL render the body as a collapsible, syntax-highlighted tree using a pretty-printer.
4. WHEN an HTTP response body is not valid JSON, THE Response_Viewer SHALL display the raw response body as plain text.
5. THE Response_Viewer SHALL provide a Headers tab listing all response header key-value pairs.
6. WHEN a user clicks the copy button in the Response_Viewer, THE Application SHALL copy the full response body to the system clipboard.
7. IF the HTTP request fails due to a network error, THEN THE Response_Viewer SHALL display a descriptive error message indicating the failure reason.
8. WHILE a request is in flight, THE Response_Viewer SHALL display a loading indicator.

---

### Requirement 4: Environment Variables

**User Story:** As a developer, I want to define multiple named environments with their own variable sets so that I can switch between Local, Staging, and Production configurations without editing each request.

#### Acceptance Criteria

1. THE Application SHALL support creating, renaming, and deleting named Environments, each stored in Storage with a unique UUID.
2. THE Topbar SHALL display an Active_Environment switcher that lists all saved Environments plus a "No Environment" option.
3. WHEN the user selects an Environment in the Topbar switcher, THE Application SHALL set that Environment as the Active_Environment for all subsequent Variable_Substitution operations.
4. THE Application SHALL provide an Environments Modal where users can add, edit, and delete KeyValue variable pairs within any Environment.
5. WHEN Variable_Substitution is performed, THE Application SHALL replace every `{{variable_name}}` token in the target string with the matching value from the Active_Environment's variables.
6. WHEN a `{{variable_name}}` token has no matching key in the Active_Environment, THE Application SHALL leave the token unreplaced and highlight it visually in the URL field to indicate an unresolved variable.
7. THE Application SHALL display a visual distinction (e.g., highlighted badge) around resolved `{{variable_name}}` tokens in the URL field to confirm successful substitution.

---

### Requirement 5: JWT Token Management

**User Story:** As a developer, I want to store and auto-inject JWT bearer tokens per environment so that I don't have to paste tokens manually for every request.

#### Acceptance Criteria

1. THE JWT_Store SHALL persist one JWT bearer token per Environment in Storage.
2. THE Application SHALL provide a UI control in the Environments Modal to set and clear the JWT token for each Environment.
3. WHEN the Active_Environment has a stored JWT token and the Request's auth type is `bearer`, THE Request_Builder SHALL automatically inject the token as the `Authorization: Bearer <token>` header.
4. THE Application SHALL compute the expiry time of a stored JWT token by decoding its payload claims without verifying the signature.
5. WHEN a stored JWT token's expiry time is within 5 minutes of the current time, THE Application SHALL display a warning indicator on the Environments Modal and the Auth tab.
6. WHEN a stored JWT token has passed its expiry time, THE Application SHALL display an expired indicator and SHALL NOT auto-inject the token.
7. IF a stored value is not a valid JWT (missing header, payload, or signature segments), THEN THE Application SHALL display a validation error and SHALL NOT store the invalid value.

---

### Requirement 6: Export and Import

**User Story:** As a developer, I want to export my collections and import from Postman or OpenAPI formats so that I can share and migrate API definitions.

#### Acceptance Criteria

1. WHEN a user triggers an export for a Collection, THE Application SHALL serialize the Collection (including all Folders and Requests) to a JSON file and initiate a browser file download.
2. THE exported JSON format SHALL be the Application's native format, preserving all Request fields including method, url, headers, body, and auth type.
3. WHEN a user imports a file in Postman Collection v2.1 JSON format, THE Application SHALL parse the file and create a corresponding Collection in Storage.
4. WHEN a user imports a file in OpenAPI 3.x or Swagger 2.x YAML format, THE Application SHALL parse the file and create a Collection where each API operation becomes a Request.
5. IF an imported file does not conform to any supported format, THEN THE Application SHALL display a descriptive parse error message and SHALL NOT modify Storage.
6. FOR ALL valid native-format Collections, exporting then importing SHALL produce a Collection equivalent to the original (round-trip property).
7. WHEN an import would create a Collection with a name that already exists in Storage, THE Application SHALL append a numeric suffix (e.g., "My API (2)") to avoid a naming collision.

---

### Requirement 7: Code Generation

**User Story:** As a developer, I want to generate equivalent code snippets from a request so that I can reproduce it in my application code.

#### Acceptance Criteria

1. THE Code_Generator SHALL support five output targets: cURL, PHP cURL, Laravel HTTP Client, JavaScript `fetch()`, and Axios.
2. WHEN a user opens the Code_Generator for a Request, THE Application SHALL perform Variable_Substitution on the Request fields using the Active_Environment before generating the snippet.
3. WHEN the Request's auth type is `bearer` and a valid, non-expired JWT token is available in the JWT_Store, THE Code_Generator SHALL include the `Authorization: Bearer <token>` header in the generated snippet.
4. THE Code_Generator SHALL render the selected snippet in a read-only Monaco Editor instance with appropriate syntax highlighting for the target language.
5. WHEN a user clicks the copy button in the Code_Generator, THE Application SHALL copy the full generated snippet to the system clipboard.
6. WHEN the user selects a different output target, THE Code_Generator SHALL update the displayed snippet immediately without closing the modal.
7. THE Code_Generator SHALL produce syntactically valid output for each supported target given any combination of HTTP method, headers, body type, and auth configuration.

---

### Requirement 8: Data Persistence and Storage

**User Story:** As a developer, I want all my data stored locally in the browser so that no data is sent to any external server.

#### Acceptance Criteria

1. THE Application SHALL use IndexedDB via the `idb` library as the sole persistence mechanism for all Collections, Folders, Requests, Environments, and JWT tokens.
2. THE Application SHALL perform all Storage reads and writes asynchronously without blocking the UI thread.
3. WHEN the Application initializes, THE Application SHALL load all Collections and Environments from Storage into the Pinia store before rendering the Sidebar.
4. THE Application SHALL NOT transmit any Collection, Request, Environment, or JWT token data to any external server or remote endpoint.
5. WHEN a Storage schema migration is required due to a version increment, THE Application SHALL execute the migration within the `idb` upgrade callback without data loss.

---

### Requirement 9: Application Shell and Navigation

**User Story:** As a developer, I want a clear, single-page layout so that I can navigate between my collections and work on requests efficiently.

#### Acceptance Criteria

1. THE Application SHALL render a persistent Sidebar on the left containing the Collections tree with expand/collapse controls for Collections and Folders.
2. THE Application SHALL render a persistent Topbar containing the application name, the Active_Environment switcher, and controls to open the Environments Modal.
3. WHEN a user clicks a Request in the Sidebar, THE Application SHALL open that Request in the Request_Builder panel and load its saved fields.
4. THE Application SHALL support having at most one Request open in the Request_Builder at a time in the MVP.
5. WHEN unsaved changes exist in the Request_Builder, THE Application SHALL display a visual indicator (e.g., a dot on the tab or title) to signal unsaved state.
6. THE Application SHALL be fully functional in modern browsers (Chrome 110+, Firefox 110+, Safari 16+) without requiring any browser extension or server-side component.
