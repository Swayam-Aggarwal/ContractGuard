# ContractGuard Backend API Specification

**Product:** ContractGuard\
**Document version:** 1.2\
**API version:** v1\
**Base path:** `/api/v1`\
**Format:** JSON over HTTP, with multipart uploads for OpenAPI documents\
**Authentication:** JWT through an HttpOnly cookie\
**Last updated:** 14 November 2026

---

## 1. Purpose

This document describes the REST API exposed by the ContractGuard backend.

It defines the endpoint inventory, authentication model, request and response conventions, validation boundaries, and principal application workflows.

This API is separate from the OpenAPI specifications uploaded by users for compatibility analysis.

The documented endpoints represent ContractGuard's application API. The OpenAPI documents stored within the application describe external API contracts being analyzed.

## 2. API Conventions

### 2.1 Base URL

Development example:

`http://localhost:5000/api/v1`

Production requests use the same-origin `/api/v1` path.

### 2.2 Authentication

Protected endpoints require the `cg_access` HttpOnly authentication cookie.

The cookie is issued during successful registration or login and cleared during logout.

Authentication requirements:

- The backend verifies the JWT signature and expiration.
- The authenticated principal is derived by backend middleware.
- The token is not accepted from request bodies, query parameters, or URL paths.
- The frontend does not read or expose the JWT.
- Protected resource queries enforce authenticated project ownership.
- Client-supplied `ownerId` values are never trusted.
- Passwords and password hashes are never returned in normal API responses.

### 2.3 Request Origin and CSRF Protection

Because authentication is cookie-based, state-changing requests require origin protection.

For unsafe HTTP methods (`POST`, `PUT`, `PATCH`, and `DELETE`):

- Validate the request origin against the configured application origin.
- Reject untrusted origins.
- Reject `Origin: null`.
- Do not allow state changes through GET requests.
- Do not rely exclusively on cookie `SameSite` settings as a CSRF defense.
- Use a validated Referer fallback only where the application configuration explicitly supports it.

Registration, login, logout, uploads, comparisons, test-case transitions, AI submissions, and test-run creation must follow the applicable origin-protection rules.

### 2.4 Success Response

Successful responses use a consistent envelope:

```json
{
  "success": true,
  "data": {}
}
```

The `data` object contains the resource or operation result.

Pagination or additional response metadata may be supplied where required.

### 2.5 Error Response

Error responses use the following structure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": []
  }
}
```

Error-handling requirements:

- Error codes remain stable for documented conditions.
- Messages explain the failure without exposing internal implementation details.
- Details may identify invalid fields and safe validation messages.
- Stack traces, credentials, provider keys, internal filesystem paths, raw database queries, and secret configuration are never returned.
- Unexpected errors are handled by centralized backend error middleware.

### 2.6 HTTP Status Conventions

| Status | Meaning |
|---|---|
| `200` | Successful read, update, or state transition |
| `201` | Resource successfully created |
| `202` | Asynchronous or bounded operation accepted |
| `204` | Successful operation without a response body |
| `400` | Malformed or invalid request |
| `401` | Missing or invalid authentication |
| `403` | Authenticated request rejected by an access or security policy |
| `404` | Resource not found or not accessible |
| `409` | Duplicate resource or conflicting state |
| `413` | Upload or request exceeds configured size |
| `415` | Unsupported media type or file format |
| `422` | Semantically unsupported document or operation |
| `429` | Request rate limit exceeded |
| `500` | Unexpected server error |
| `503` | Required service or provider unavailable |

## 3. Endpoint Inventory

All paths in this section are relative to `/api/v1`.

### 3.1 Health

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/health` | Return application liveness and safe dependency status | No |

The health endpoint must not disclose:

- Environment variables.
- Database credentials.
- Provider API keys.
- Internal filesystem paths.
- Stack traces.
- Detailed infrastructure configuration.

### 3.2 Authentication

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| POST | `/auth/register` | Register a new account | No |
| POST | `/auth/login` | Authenticate and issue cookie | No |
| POST | `/auth/logout` | Clear authentication cookie | Yes |
| GET | `/auth/me` | Retrieve current account information | Yes |

#### Registration Request

```json
{
  "email": "developer@example.com",
  "password": "example-password",
  "displayName": "Developer"
}
```

#### Login Request

```json
{
  "email": "developer@example.com",
  "password": "example-password"
}
```

Successful authentication sets the `cg_access` cookie.

The response must not contain:

- Plaintext password.
- Password hash.
- Raw JWT.
- Authentication signing secret.

`GET /auth/me` returns only safe account information.

Logout clears the authentication cookie using matching cookie configuration attributes.

### 3.3 Projects

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/projects` | List projects owned by the authenticated user | Yes |
| POST | `/projects` | Create a personal project | Yes |
| GET | `/projects/:projectId` | Retrieve an owned project | Yes |
| PATCH | `/projects/:projectId` | Update project name or description | Yes |
| DELETE | `/projects/:projectId` | Delete a project and its dependent records | Yes |

#### Create Project Request

```json
{
  "name": "Demo Store API",
  "description": "API compatibility and regression-testing workspace."
}
```

#### Update Project Request

```json
{
  "name": "Demo Store API",
  "description": "Updated project description."
}
```

Rules:

- The server derives ownership from the authenticated principal.
- The client cannot submit or override `ownerId`.
- Project queries are scoped to the authenticated owner.
- Duplicate owner-scoped slugs return a conflict response.
- Project deletion follows the implemented dependent-record deletion workflow.
- The backend must complete the required persistence operation before reporting success.

### 3.4 Specification Uploads and Versions

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| POST | `/projects/:projectId/specifications` | Upload an OpenAPI document | Yes |
| GET | `/projects/:projectId/specifications` | List specification versions | Yes |
| GET | `/specifications/:specVersionId` | Retrieve specification details | Yes |
| GET | `/specifications/:specVersionId/operations` | List extracted operations | Yes |
| GET | `/specifications/:specVersionId/operations/:operationKey` | Retrieve operation details | Yes |

#### Upload Contract

The upload endpoint accepts `multipart/form-data`.

Required file field:

`file`

Additional required field:

`label`

Accepted formats:

- JSON.
- YAML.

Maximum original uploaded document size:

`1 MiB`

The backend must:

1. Authenticate the user.
2. Verify project ownership.
3. Validate the upload size.
4. Inspect and parse the uploaded content.
5. Validate the OpenAPI document and supported version.
6. Apply parser and normalization resource limits.
7. Resolve supported internal references.
8. Reject external reference fetching.
9. Calculate SHA-256 from the original uploaded bytes.
10. Detect duplicate project-scoped content.
11. Preserve the original source text.
12. Persist parsing and support diagnostics.
13. Assign the runner profile through the trusted fixture registry.
14. Return a safe specification-version response.

The client must not supply or override server-derived fields such as:

- `ownerId`
- `uploadedBy`
- `openapiVersion`
- `contentHash`
- `operationCount`
- `parseStatus`
- `supportStatus`
- `runnerProfile`
- `document`

External `$ref` resolution is disabled.

The backend must not fetch external URLs, declared API server URLs, or arbitrary resources described in an uploaded specification.

#### Upload Response Example

```json
{
  "success": true,
  "data": {
    "specVersion": {
      "id": "SPEC_VERSION_ID",
      "projectId": "PROJECT_ID",
      "label": "v1",
      "sourceFormat": "yaml",
      "openapiVersion": "3.0.3",
      "operationCount": 8,
      "parseStatus": "VALID",
      "supportStatus": "COMPLETE",
      "runnerProfile": "NONE"
    }
  }
}
```

The values are illustrative. The server determines the actual parsing, support, and fixture-eligibility values.

### 3.5 API Explorer

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/specifications/:specVersionId/operations` | List extracted operations | Yes |
| GET | `/specifications/:specVersionId/operations/:operationKey` | Retrieve one operation | Yes |

Operation details may include:

- Original path.
- HTTP method.
- Operation summary and description.
- Effective parameters.
- Request-body information.
- Supported responses.
- Supported schema details.
- Internal reference information.
- Source JSON Pointers.
- Parser or support warnings.

The API Explorer is read-only.

It does not execute requests against arbitrary API server URLs.

### 3.6 Compatibility Reports

ContractGuard exposes compatibility reports through the `diff-reports` resource.

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| POST | `/projects/:projectId/diff-reports` | Create a baseline/candidate comparison | Yes |
| GET | `/projects/:projectId/diff-reports` | List project comparison reports | Yes |
| GET | `/projects/:projectId/diff-reports/:reportId` | Retrieve a comparison report and coverage projection | Yes |

#### Create Report Request

```json
{
  "baselineVersionId": "BASELINE_SPEC_VERSION_ID",
  "candidateVersionId": "CANDIDATE_SPEC_VERSION_ID"
}
```

The backend verifies:

- Both specification versions exist.
- Both versions belong to the same project.
- The authenticated user owns the project.
- The versions are distinct.
- Both versions satisfy comparison validation requirements.

The backend determines:

- Comparison direction.
- Compatibility ruleset version.
- Analysis status.
- Finding classifications.
- Finding identifiers.
- Affected operation keys.
- Classification counts.
- Warnings.

The client cannot override these values.

#### Comparison Direction

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

The baseline represents the contract existing consumers may rely upon.

The candidate represents the newer provider contract being evaluated.

#### Ruleset

`CG-COMPAT-1.1`

The ruleset identifier is persisted with the report.

#### Report Contents

A report may contain:

- Baseline and candidate references.
- Comparison direction.
- Ruleset version.
- Analysis status.
- Classification summary.
- Individual findings.
- Affected operation keys.
- Source JSON Pointers.
- Finding rationales.
- Partial-analysis warnings.
- Test-coverage projections.

#### Finding Classifications

- `BREAKING`
- `POTENTIALLY_BREAKING`
- `NON_BREAKING`
- `INFORMATIONAL`
- `UNSUPPORTED`

#### Analysis Status

- `COMPLETE`
- `PARTIAL`
- `FAILED`

A complete specification comparison does not prove that a deployed API implementation is runtime-compatible.

### 3.7 Test Cases

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/specifications/:specVersionId/test-cases` | List test cases for a baseline version | Yes |
| POST | `/specifications/:specVersionId/test-cases` | Create a manual draft test case | Yes |
| GET | `/test-cases/:testCaseId` | Retrieve a test case | Yes |
| PATCH | `/test-cases/:testCaseId` | Edit an eligible draft test case | Yes |
| POST | `/test-cases/:testCaseId/approve` | Approve a reviewed test case | Yes |
| POST | `/test-cases/:testCaseId/archive` | Archive a test case | Yes |

A test case belongs to exactly one specification version.

For a comparison run, that version must match the comparison's baseline specification version.

#### Create Test Case Request

```json
{
  "operationKey": "CANONICAL_OPERATION_KEY",
  "operationPath": "/products/{productId}",
  "title": "Retrieve an existing product",
  "description": "Verify that an existing consumer can retrieve a product.",
  "request": {
    "pathParams": {
      "productId": "1001"
    },
    "queryParams": {}
  },
  "assertions": {
    "expectedStatus": 200,
    "propertyAssertions": [],
    "requiredProperties": [
      "id",
      "name",
      "price"
    ]
  }
}
```

The request must conform to the baseline operation.

The backend validates:

- Operation-key and path association.
- Required path parameter values.
- Declared query parameter names.
- Input length and count limits.
- Assertion structure and supported assertion types.

Arbitrary target URLs, hostnames, headers, credentials, executable code, and shell commands are not accepted.

#### Test Case Lifecycle

- `DRAFT`
- `APPROVED`
- `ARCHIVED`

AI-generated test cases are initially saved as drafts.

Only approved and otherwise eligible test cases may be executed.

Approved test cases must not be silently modified through ordinary draft-editing operations.

### 3.8 AI-Assisted Test Suggestions

AI suggestions are scoped to a selected compatibility report and a supported synthetic Demo Store operation.

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/projects/:projectId/diff-reports/:reportId/ai-test-suggestions/preview` | Retrieve the selected operation and provider-submission preview | Yes |
| POST | `/projects/:projectId/diff-reports/:reportId/ai-test-suggestions` | Generate and persist validated draft suggestions | Yes |

#### Supported Operations

| Operation ID | Method | Path |
|---|---|---|
| `listProducts` | GET | `/products` |
| `getProduct` | GET | `/products/{productId}` |

#### Preview Request

The preview endpoint uses the `operationId` query parameter.

Example:

```http
GET /api/v1/projects/PROJECT_ID/diff-reports/REPORT_ID/ai-test-suggestions/preview?operationId=listProducts
```

The preview operation does not contact Gemini.

It returns the selected operation and the sanitized provider-submission preview, allowing the user to inspect the information before submission.

#### Generation Request

```json
{
  "operationId": "listProducts",
  "consent": true
}
```

The backend must enforce:

1. The project and report belong to the authenticated user.
2. The report references valid baseline and candidate versions.
3. The selected operation is supported.
4. The operation context is built from the trusted synthetic fixture.
5. Explicit consent is present.
6. The provider key remains server-side.
7. Model output conforms to the expected structured format.
8. Generated suggestions match the selected operation.
9. Valid suggestions are persisted as draft test cases.

The client cannot submit arbitrary prompt text or choose an execution target.

AI-generated content is data, not executable code.

#### AI Submission Restrictions

- Only the selected trusted synthetic operation context is submitted.
- Arbitrary uploaded production specifications are not submitted.
- Credentials and API keys are excluded.
- Consent is required before provider submission.
- AI output is validated before persistence.
- Suggestions remain drafts until reviewed and approved.
- Provider failure does not affect compatibility analysis or regression execution.

The AI endpoint is rate-limited per authenticated user.

### 3.9 Regression Test Runs

Every test run is associated with a specific compatibility report.

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| POST | `/projects/:projectId/diff-reports/:reportId/test-runs` | Start a regression run for a report | Yes |
| GET | `/projects/:projectId/diff-reports/:reportId/test-runs` | List runs for a report | Yes |
| GET | `/projects/:projectId/diff-reports/:reportId/test-runs/:testRunId` | Retrieve a run and its results | Yes |

#### Run Creation Request

```json
{
  "testCaseIds": [
    "TEST_CASE_ID_1",
    "TEST_CASE_ID_2"
  ]
}
```

The server verifies:

- The report belongs to the project in the route.
- The project is owned by the authenticated user.
- The baseline and candidate versions match the report.
- The candidate has a recognized bundled execution profile.
- Every selected test case belongs to the report's baseline version.
- Every selected test case is approved.
- Every selected operation is supported by the bundled implementation.
- The selected count is within the configured limit.
- Execution concurrency and time limits are respected.

A successful run-creation request returns `202 Accepted`.

#### Execution Restrictions

The client cannot choose:

- Target URL.
- Hostname or IP address.
- Port.
- Network destination.
- Fixture identifier.
- Candidate implementation version.
- Final run status.
- Final test results.

The server selects the candidate implementation through the trusted fixture registry and executes supported GET operations.

Candidate responses are validated against the baseline response contract.

The runner does not use uploaded OpenAPI `servers` entries as execution targets.

#### Run Statuses

- `QUEUED`
- `RUNNING`
- `PASSED`
- `FAILED`
- `PARTIAL`
- `INTERRUPTED`

Individual results:

- `PASSED`
- `FAILED`
- `SKIPPED`
- `UNSUPPORTED`
- `ERROR`

The run result must distinguish a contract-validation failure from an unsupported operation or execution error.

## 4. Pagination and Query Conventions

Collection endpoints use bounded pagination where supported.

Common query parameters include:

- `page`: one-based page number.
- `limit`: maximum number of returned records.
- `sort`: endpoint-specific allowlisted sort field.
- `order`: `asc` or `desc`.

The backend enforces maximum values and validates sort fields.

Unknown query parameters must be rejected or deliberately stripped according to the endpoint validator.

Arbitrary client values must never be passed directly into MongoDB filters, sort expressions, or projections.

## 5. Validation Requirements

Request bodies, path parameters, query strings, and multipart metadata are validated by backend validators.

Requirements:

- Validate MongoDB ObjectIds before database access.
- Validate project ownership before child-resource operations.
- Reject unknown security-sensitive fields.
- Apply explicit string, array, and payload limits.
- Validate test-case approval status before execution.
- Verify that selected tests belong to the report's baseline version.
- Validate upload size and source format.
- Calculate specification hashes on the server.
- Assign runner profiles through the trusted fixture registry.
- Keep provider configuration server-side.
- Validate AI output before creating draft test cases.
- Never trust client-supplied report status, test outcome, ruleset, or target.

## 6. Error Code Catalogue

| Code | Meaning |
|---|---|
| `VALIDATION_ERROR` | Request does not match the input schema |
| `AUTH_REQUIRED` | Authentication is missing or invalid |
| `CSRF_ORIGIN_REJECTED` | Request failed origin validation |
| `RESOURCE_NOT_FOUND` | Resource does not exist or is not owned |
| `DUPLICATE_RESOURCE` | Duplicate project-scoped content or label |
| `PROJECT_DELETED` | Project is no longer active |
| `SPEC_INVALID` | OpenAPI document is structurally invalid |
| `SPEC_VERSION_UNSUPPORTED` | OpenAPI version is unsupported |
| `SPEC_LIMIT_EXCEEDED` | Document or parser resource limit exceeded |
| `SPEC_REFERENCE_UNSUPPORTED` | Reference is outside supported resolution boundaries |
| `ANALYSIS_PARTIAL` | Unsupported constructs prevent complete analysis |
| `COMPARISON_FAILED` | Compatibility analysis could not be completed |
| `COMPARISON_VERSION_MISMATCH` | Versions do not belong to the same project |
| `TEST_CASE_STATE_CONFLICT` | Requested lifecycle transition is not allowed |
| `TEST_CASE_LIMIT_EXCEEDED` | Specification test-case limit exceeded |
| `TEST_CASE_NOT_APPROVED` | Selected test case is not approved |
| `TEST_CASE_BASELINE_MISMATCH` | Test case does not belong to the report baseline |
| `TEST_RUN_LIMIT_EXCEEDED` | Test count, concurrency, or time limit exceeded |
| `COMPARISON_NOT_RUNNABLE` | Candidate has no eligible bundled execution profile |
| `UNSUPPORTED_OPERATION` | Operation is not supported by the bundled runner |
| `AI_NOT_CONFIGURED` | Gemini integration is not configured |
| `AI_CONSENT_REQUIRED` | Explicit provider-submission consent is missing |
| `AI_OPERATION_NOT_FOUND` | Selected operation is not in the supported synthetic operation registry |
| `AI_INVALID_MODEL_OUTPUT` | Provider response does not match the required suggestion structure |
| `RATE_LIMITED` | Endpoint rate limit exceeded |

Actual error codes are determined by the backend error mapping. This catalogue should be updated whenever a public error contract changes.

## 7. API Security Requirements

- All protected endpoints require authentication.
- All resource operations enforce project ownership.
- Cookie-authenticated state-changing requests use origin protection.
- Uploaded documents are bounded and validated on the backend.
- External references and arbitrary server URLs are never fetched.
- Comparison direction and ruleset are selected by the backend.
- Test cases are linked to baseline versions.
- Test runs require a valid report.
- Only approved eligible cases can execute.
- The runner uses server-controlled bundled implementations.
- AI submissions require explicit consent.
- AI output is validated before persistence.
- Secrets, stack traces, and sensitive paths are not returned.

## 8. API Acceptance Criteria

The API contract is accepted when:

1. Authentication and project ownership are enforced on protected routes.
2. Request validation is applied to bodies, parameters, and queries.
3. Upload size and parsing limits are enforced.
4. Specification versions preserve original source content.
5. Comparison creation enforces project and version consistency.
6. Comparison reports retain their direction and ruleset.
7. Report retrieval includes the current test-coverage projection.
8. Test cases are associated with baseline specification versions.
9. Draft, approved, and archived transitions are enforced server-side.
10. Test runs reference a comparison and eligible baseline cases.
11. Candidate responses are checked against baseline response schemas.
12. Arbitrary network execution is not exposed.
13. AI preview does not call the provider.
14. AI generation requires explicit consent.
15. Valid AI suggestions are persisted as drafts.
16. Provider unavailability does not disable deterministic functionality.
17. Error responses do not leak credentials or internal implementation details.
18. Endpoint behavior is covered by automated tests.