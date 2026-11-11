# ContractGuard Backend API Specification

**Product:** ContractGuard  
**Document version:** 1.1  
**Base path:** `/api/v1`  
**Format:** JSON over HTTP, with multipart upload for specification files  
**Authentication:** JWT in an HttpOnly cookie

This document defines ContractGuard's application backend API.

It is separate from the OpenAPI specifications uploaded by users for compatibility analysis.

A machine-readable OpenAPI document for ContractGuard's own backend may be generated during implementation after the route contracts stabilize.

## 1. API conventions

### 1.1 Base URL

Development example:

`http://localhost:5000/api/v1`

Production requests use the same-origin `/api/v1` path.

### 1.2 Authentication

Protected endpoints require the `cg_access` HttpOnly cookie.

The cookie is issued during successful registration/login and cleared during logout.

Rules:

- The JWT is not accepted from request bodies, query parameters, or URL paths.
- The frontend must not read the JWT directly.
- The backend verifies the JWT and constructs an authenticated principal.
- Every project and child-resource lookup must enforce ownership.
- The backend must not trust a client-supplied `ownerId`.
- Cookie security settings are defined in `TRD.md`.

### 1.3 CSRF and request origin validation

Because authentication uses cookies, state-changing requests require CSRF protection.

For unsafe methods (`POST`, `PUT`, `PATCH`, and `DELETE`):

- Validate the exact request Origin against the configured application origin.
- When Origin is absent, use a validated Referer fallback where appropriate.
- Reject `Origin: null`.
- Reject requests without a verified origin or an alternative valid CSRF-token mechanism.
- Do not treat SameSite cookie settings as the only CSRF control.
- Do not permit state changes through GET requests.

Registration, login, logout, uploads, comparisons, approvals, AI requests, and test-run creation must follow the applicable request-origin protection.

### 1.4 JSON success envelope

Successful response:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

`meta` is omitted when pagination or other metadata is unnecessary.

### 1.5 JSON error envelope

Error response:

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

Rules:

- Error codes must remain stable.
- Messages must be useful to the caller.
- Details may identify invalid fields and safe validation messages.
- Stack traces, secrets, provider credentials, filesystem paths, and internal implementation details must never be returned.
- Production errors must not expose MongoDB queries or raw exception objects.

### 1.6 HTTP status conventions

| Status | Meaning |
|---|---|
| `200` | Successful read or update |
| `201` | Resource created |
| `202` | Bounded test run accepted |
| `204` | Successful operation without a response body |
| `400` | Malformed or invalid request |
| `401` | Missing or invalid authentication |
| `403` | Authenticated request rejected by an access or security policy |
| `404` | Resource not found or not owned |
| `409` | Duplicate resource or conflicting state |
| `413` | Upload or request too large |
| `415` | Unsupported file or request media type |
| `422` | Semantically unsupported document or operation |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
| `503` | Required dependency unavailable |

## 2. Endpoint inventory

All paths below are relative to `/api/v1`.

### 2.1 Health

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/health` | Liveness and safe dependency status | No |

The health endpoint must not disclose:
- Environment variables.
- Database credentials.
- Provider API keys.
- Internal paths.
- Stack traces.
- Detailed infrastructure configuration.

### 2.2 Authentication

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| POST | `/auth/register` | Create an account | No |
| POST | `/auth/login` | Authenticate and set cookie | No |
| POST | `/auth/logout` | Clear authentication cookie | Yes |
| GET | `/auth/me` | Return current account summary | Yes |

Registration request:

```json
{
  "email": "developer@example.com",
  "password": "example-password",
  "displayName": "Developer"
}
```

Login request:

```json
{
  "email": "developer@example.com",
  "password": "example-password"
}
```

Successful authentication sets the `cg_access` cookie.

The response body must not contain:
- The password.
- The password hash.
- The raw JWT.
- Secret authentication metadata.

`GET /auth/me` returns only safe account information.

Logout clears the authentication cookie using matching cookie path and configuration attributes.

### 2.3 Projects

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/projects` | List the authenticated user's projects | Yes |
| POST | `/projects` | Create a project | Yes |
| GET | `/projects/:projectId` | Retrieve a project | Yes |
| PATCH | `/projects/:projectId` | Update project name or description | Yes |
| DELETE | `/projects/:projectId` | Soft-delete a project | Yes |

Create project request:

```json
{
  "name": "Demo Store API",
  "description": "API compatibility and regression testing workspace."
}
```

Update project request:

```json
{
  "name": "Demo Store API v2",
  "description": "Updated project description."
}
```

Rules:

- The server derives `ownerId` from the authenticated principal.
- Project queries include the authenticated owner ID.
- Deleted projects cannot accept new resources or operations.
- Project deletion is a soft-delete operation in v1.
- Duplicate owner-scoped project slugs return `409`.

### 2.4 Specification uploads and versions

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| POST | `/projects/:projectId/specifications` | Upload an OpenAPI document | Yes |
| GET | `/projects/:projectId/specifications` | List project versions | Yes |
| GET | `/specifications/:specVersionId` | Retrieve specification summary/details | Yes |
| GET | `/specifications/:specVersionId/operations` | List extracted operations | Yes |
| GET | `/specifications/:specVersionId/operations/:operationKey` | Retrieve an operation | Yes |

#### Upload contract

The upload endpoint accepts `multipart/form-data`.

Required file field:

`file`

Additional fields:

- `label`: required, user-facing version label.

Accepted file formats:

- JSON.
- YAML.

Maximum uploaded document size:

`1 MiB`

The backend must:

1. Authenticate and verify project ownership.
2. Validate the uploaded file size.
3. Inspect the file content and format.
4. Reject unsupported file types.
5. Parse the OpenAPI document.
6. Validate the OpenAPI version and supported constructs.
7. Compute SHA-256 from the original uploaded bytes.
8. Detect duplicate content within the project.
9. Store the original source text.
10. Store parsed document information when available.
11. Assign the runner profile on the server.
12. Return a safe specification-version summary.

The client cannot submit or override:

- `ownerId`
- `uploadedBy`
- `openapiVersion`
- `contentHash`
- `operationCount`
- `parseStatus`
- `runnerProfile`
- `document`

These are server-derived values.

External `$ref` resolution is disabled.

The backend must not fetch external URLs, server URLs, or arbitrary resources described in an uploaded specification.

An invalid but bounded upload may retain its original source and safe parser diagnostics. It cannot be compared or executed.

#### Upload response example

```json
{
  "success": true,
  "data": {
    "id": "SPEC_VERSION_ID",
    "projectId": "PROJECT_ID",
    "label": "v1",
    "sourceFormat": "yaml",
    "openapiVersion": "3.2.1",
    "operationCount": 8,
    "parseStatus": "VALID",
    "runnerProfile": "NONE",
    "createdAt": "2026-11-07T10:00:00.000Z"
  }
}
```

The example values are illustrative. `runnerProfile` is assigned by the server and is not guaranteed to be `NONE` for every upload.

### 2.5 API Explorer operations

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/specifications/:specVersionId/operations` | List supported operations | Yes |
| GET | `/specifications/:specVersionId/operations/:operationKey` | Retrieve operation details | Yes |

Operation details may include:

- Original path.
- HTTP method.
- Summary and description.
- Parameters.
- Request body definition.
- Supported response definitions.
- Referenced schema summaries.
- Relevant support warnings.

The API Explorer is read-only in v1.

It must not execute requests against arbitrary specification servers.

### 2.6 Comparisons

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| POST | `/projects/:projectId/comparisons` | Create a comparison | Yes |
| GET | `/projects/:projectId/comparisons` | List project comparisons | Yes |
| GET | `/comparisons/:comparisonId` | Retrieve comparison and coverage information | Yes |

Comparison creation request:

```json
{
  "baselineVersionId": "BASELINE_SPEC_VERSION_ID",
  "candidateVersionId": "CANDIDATE_SPEC_VERSION_ID"
}
```

The previous `baselineSpecVersionId` and `candidateSpecVersionId` request names remain accepted as Phase 4 compatibility aliases. New clients should use the shorter `baselineVersionId` and `candidateVersionId` names.

The server must verify:

- Both versions exist.
- Both versions belong to the same project.
- The project belongs to the authenticated user.
- Both documents are valid and eligible for comparison.
- Baseline and candidate are different versions.

The server sets:

- Comparison direction.
- Ruleset version.
- Analysis status.
- Classification counts.
- Change findings.
- Warnings.

The client cannot override these values.

#### Comparison direction

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

The comparison evaluates whether the candidate provider contract preserves compatibility for existing consumers of the baseline contract.

The report must store the ruleset identifier, for example:

`CG-COMPAT-1.1`

#### Comparison response

The response contains:

- Baseline and candidate references.
- Comparison direction.
- Ruleset version.
- Analysis status.
- Classification counts.
- Change findings.
- Warnings.
- Test-coverage projections.

Each change includes its relevant affected operation keys.

#### Change-to-test coverage

Coverage is calculated from the current test-case library when a comparison is retrieved.

It is not stored as an independently mutable copy inside the comparison document.

Illustrative response structure:

```json
{
  "success": true,
  "data": {
    "id": "COMPARISON_ID",
    "baselineVersionId": "BASELINE_ID",
    "candidateVersionId": "CANDIDATE_ID",
    "direction": "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
    "rulesetVersion": "CG-COMPAT-1.1",
    "analysisStatus": "COMPLETE",
    "summary": {
      "breaking": 2,
      "potentiallyBreaking": 1,
      "nonBreaking": 4,
      "informational": 1,
      "unsupported": 0
    },
    "changes": [
      {
        "changeId": "CHANGE_ID",
        "ruleId": "RES-002",
        "classification": "BREAKING",
        "operationKey": "GET /products/{}",
        "affectedOperationKeys": [
          "GET /products/{}",
          "GET /products/{}/reviews"
        ],
        "jsonPointer": "#/components/schemas/Product/properties/price",
        "summary": "Response property type changed.",
        "rationale": "The candidate no longer preserves the baseline response value type.",
        "testCoverage": {
          "totalLinkedTestCases": 2,
          "approvedCount": 1,
          "draftCount": 1,
          "coverageStatus": "COVERED"
        }
      }
    ],
    "createdAt": "2026-11-07T10:30:00.000Z"
  }
}
```

This is an illustrative response, not a claim that these IDs, counts, or operations exist in the bundled fixtures.

Coverage status values:

- `COVERED`: At least one approved linked test case exists.
- `DRAFT_ONLY`: Linked test cases exist, but none is approved.
- `UNCOVERED`: No linked test case exists.

Coverage does not prove that the change has been tested successfully. Actual regression evidence comes from a test run.

### 2.7 Test cases

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/specifications/:specVersionId/test-cases` | List baseline-version test cases | Yes |
| POST | `/specifications/:specVersionId/test-cases` | Create manual draft test | Yes |
| GET | `/test-cases/:testCaseId` | Retrieve a test case | Yes |
| PATCH | `/test-cases/:testCaseId` | Edit an eligible draft test | Yes |
| POST | `/test-cases/:testCaseId/approve` | Approve a reviewed test | Yes |
| POST | `/test-cases/:testCaseId/archive` | Archive a test case | Yes |

A test case belongs to exactly one specification version.

For a comparison run, that version must be the comparison's baseline version.

#### Create test-case request

```json
{
  "operationKey": "GET /products/{}",
  "operationPath": "/products/{productId}",
  "title": "Retrieve an existing product",
  "description": "Verify that an existing consumer can retrieve a product.",
  "request": {
    "pathParams": {
      "productId": "1001"
    },
    "queryParams": {
      "includeReviews": "false"
    }
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

All fields shown here are illustrative.

Supported test inputs in v1:

- Path parameter values.
- Query parameter values.
- Explicit HTTP status assertions.
- Supported property assertions.
- Required-property assertions.

Arbitrary target URLs, custom hostnames, executable JavaScript, shell commands, arbitrary headers, and user-controlled authentication credentials are not accepted.

The runner constructs the request using the approved baseline operation definition and the server-controlled execution target.

#### Approval rules

A manual or AI-generated draft begins with:

`DRAFT`

After user review and approval, its status becomes:

`APPROVED`

Only approved test cases can be executed.

Approved test cases must not be silently modified after they have been used in a run.

Archiving prevents selection for new runs while preserving the historical record.

AI suggestions cannot approve themselves.

### 2.8 AI test suggestions

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| POST | `/ai/test-suggestions` | Generate draft test suggestions for a bundled synthetic fixture | Yes |

AI is optional in v1.

#### Request example

```json
{
  "specVersionId": "DEMO_SPEC_VERSION_ID",
  "operationKey": "GET /products/{}",
  "shareWithProvider": true
}
```

The endpoint must enforce the following restrictions:

1. The selected specification must be a recognized bundled synthetic Demo Store fixture.
2. Arbitrary user-uploaded specifications must not be sent to the free-tier AI provider.
3. The client must not supply arbitrary prompt text or provider request instructions.
4. The server constructs the prompt from a bounded, sanitized operation context.
5. The application displays the information that will be shared before requesting consent.
6. Explicit consent is required for each provider submission.
7. The provider key remains server-side.
8. Provider output must be validated against a strict structured response schema.
9. Suggested test cases are created as `DRAFT`.
10. The user must review and approve suggestions before execution.

No AI provider is required for core project functionality.

If the AI provider is not configured, disabled, unavailable, or over quota, the endpoint must return a safe error without breaking other application features.

No paid fallback is permitted.

### 2.9 Test runs

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| POST | `/projects/:projectId/comparisons/:comparisonId/test-runs` | Start regression run for a comparison | Yes |
| GET | `/projects/:projectId/test-runs` | List project test runs | Yes |
| GET | `/comparisons/:comparisonId/test-runs` | List runs for a comparison | Yes |
| GET | `/test-runs/:testRunId` | Retrieve status and results | Yes |

**Every test run must reference an existing comparison.**

A run is not created directly from a specification version.

#### Run creation request

```json
{
  "testCaseIds": [
    "TEST_CASE_ID_1",
    "TEST_CASE_ID_2"
  ]
}
```

The server verifies:

- The comparison belongs to the project in the path.
- The project is owned by the authenticated user.
- The baseline and candidate specification versions belong to that project.
- The candidate version has an eligible bundled execution profile.
- Every selected test case belongs to the comparison's baseline version.
- Every selected test case is approved.
- The maximum test-case count is not exceeded.
- The execution-concurrency limit is available.

The client cannot specify:

- The execution URL.
- A hostname or IP address.
- A network destination.
- An alternative implementation version.
- The baseline or candidate IDs independently of the selected comparison.
- Final test results or run status.

#### Execution behavior

The server:

1. Retrieves the selected comparison.
2. Resolves the exact baseline and candidate versions.
3. Loads approved baseline test cases.
4. Selects the server-controlled bundled candidate implementation.
5. Constructs requests from the baseline operation and approved inputs.
6. Executes only supported GET operations.
7. Validates candidate responses against the baseline response contract.
8. Evaluates explicit assertions.
9. Stores bounded, sanitized results.
10. Finalizes the run status.

The runner must never read target hosts from uploaded OpenAPI `servers` definitions.

It must not perform unrestricted outbound HTTP requests.

#### Run creation response

Successful request returns:

`202 Accepted`

Illustrative response:

```json
{
  "success": true,
  "data": {
    "id": "TEST_RUN_ID",
    "comparisonId": "COMPARISON_ID",
    "status": "QUEUED",
    "summary": {
      "total": 2,
      "passed": 0,
      "failed": 0,
      "skipped": 0,
      "unsupported": 0,
      "errors": 0
    },
    "createdAt": "2026-11-07T11:00:00.000Z"
  }
}
```

#### Run lifecycle

Allowed run-level statuses:

- `QUEUED`
- `RUNNING`
- `PASSED`
- `FAILED`
- `PARTIAL`
- `INTERRUPTED`

`CANCELLED` is outside v1.

Individual test results use:

- `PASSED`
- `FAILED`
- `SKIPPED`
- `UNSUPPORTED`
- `ERROR`

The run must distinguish an actual contract/assertion failure from an unsupported operation or execution error.

### 2.10 No arbitrary target or execution endpoint

V1 intentionally does not expose:

- An endpoint to execute an arbitrary API URL.
- An endpoint to upload executable tests.
- An endpoint to configure arbitrary HTTP headers for the runner.
- An endpoint to execute requests against uploaded `servers` URLs.
- A general-purpose HTTP proxy.

Regression execution is restricted to the bundled Demo Store implementation.

This is a deliberate SSRF and execution-safety boundary.

## 3. Pagination and query conventions

Collection endpoints use bounded pagination.

Suggested query parameters:

- `page`: 1-based page number.
- `limit`: maximum number of returned records.
- `sort`: allowlisted sort field.
- `order`: `asc` or `desc`.

The server enforces maximum values for pagination.

Sort fields must be allowlisted per endpoint.

Unknown query parameters must be rejected or deliberately stripped after validation.

Do not pass arbitrary client values directly to MongoDB sort, filter, or projection operations.

## 4. Validation requirements

All parameters, query strings, request bodies, and accepted multipart metadata must be validated with Zod.

Requirements:

- Validate MongoDB ObjectIds before database access.
- Validate project ownership before child-resource operations.
- Reject unknown high-risk fields.
- Set explicit string and array length limits.
- Validate test-case approval state before execution.
- Validate that all test cases belong to the selected comparison's baseline version.
- Validate upload size and supported content format.
- Compute specification hashes on the server.
- Never trust a client-provided runner profile.
- Never trust a client-provided AI provider or model name.
- Never trust a client-provided execution status.
- Never trust a client-provided ruleset identifier.
- Never trust an arbitrary URL supplied for execution.
- Validate AI output before creating draft records.

## 5. Error code catalogue

| Code | Meaning |
|---|---|
| `VALIDATION_ERROR` | Request does not match the input schema |
| `AUTH_REQUIRED` | Authentication is missing or invalid |
| `CSRF_ORIGIN_REJECTED` | Request failed origin/CSRF validation |
| `RESOURCE_NOT_FOUND` | Resource is missing or not owned |
| `DUPLICATE_RESOURCE` | Duplicate project-scoped content or label |
| `PROJECT_DELETED` | Project is no longer active |
| `SPEC_INVALID` | OpenAPI document is structurally invalid |
| `SPEC_VERSION_UNSUPPORTED` | OpenAPI version is outside accepted versions |
| `SPEC_LIMIT_EXCEEDED` | Document, parsing, or operation limits exceeded |
| `SPEC_REFERENCE_UNSUPPORTED` | Reference cannot be resolved within supported boundaries |
| `ANALYSIS_PARTIAL` | Unsupported constructs prevent complete analysis |
| `COMPARISON_FAILED` | Comparison could not be completed |
| `COMPARISON_VERSION_MISMATCH` | Versions do not belong to the same project |
| `TEST_CASE_NOT_APPROVED` | Test is not eligible for execution |
| `TEST_CASE_BASELINE_MISMATCH` | Test case does not belong to the comparison baseline |
| `TEST_RUN_LIMIT_EXCEEDED` | Test count, concurrency, or time limit exceeded |
| `COMPARISON_NOT_RUNNABLE` | Candidate does not have an eligible bundled execution profile |
| `UNSUPPORTED_OPERATION` | Operation is not supported by the bundled runner |
| `AI_DISABLED` | AI integration is not configured or enabled |
| `AI_CONSENT_REQUIRED` | Explicit provider-sharing consent is missing |
| `AI_FIXTURE_ONLY` | AI request uses an unapproved or non-bundled specification |
| `AI_QUOTA_OR_PROVIDER_ERROR` | Provider is unavailable or over quota |
| `RATE_LIMITED` | Endpoint request limit exceeded |

## 6. API acceptance criteria

- All protected endpoints require authentication.
- All resource queries enforce project ownership.
- Cookie-authenticated unsafe requests have CSRF/origin protection.
- Specification uploads are bounded and server-validated.
- Uploaded external references and server URLs are never fetched.
- Comparison creation fixes the direction and ruleset on the server.
- Comparison retrieval includes derived change-to-test coverage.
- Test cases belong to the baseline specification version.
- Test runs are created only against a comparison ID.
- Test runs validate candidate responses against baseline response schemas.
- Only approved test cases may execute.
- Only bundled candidate implementations may be executed.
- The runner cannot target arbitrary URLs.
- AI requests are restricted to bundled synthetic fixtures with explicit consent.
- AI results are stored as drafts and require human approval.
- Cancellation is not exposed in v1.
- Error responses never leak credentials, secrets, stack traces, or internal file paths.
- Endpoint behavior is covered by integration tests.