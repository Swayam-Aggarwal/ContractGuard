
# ContractGuard — Backend API Specification

**Document:** API Specification
**Version:** 1.2
**API version:** v1
**Base path:** `/api/v1`
**Protocol:** HTTP/HTTPS
**Data format:** JSON and multipart/form-data
**Authentication:** JWT through an HttpOnly cookie

---

## 1. Introduction

This document defines the backend API contract for ContractGuard.

ContractGuard exposes a RESTful application API used by its React frontend to manage authentication, projects, OpenAPI specification versions, compatibility comparisons, test cases, and related resources.

The backend is implemented using Express 5 and JavaScript ES modules. MongoDB and Mongoose provide persistent storage.

This API is separate from the OpenAPI specifications uploaded by users for compatibility analysis.

The primary API responsibilities are:

- Account registration and authentication.
- Project creation and management.
- OpenAPI specification ingestion and version management.
- API operation and component exploration.
- Compatibility comparison creation and retrieval.
- Reverse-reference impact analysis.
- Baseline-version test-case management.
- Change-to-test coverage projection.

Regression-run execution and AI-assisted test generation are subsequent implementation milestones and are not presented as available API endpoints in this specification.

## 2. API conventions

### 2.1 Base URL

Local development:

`http://localhost:5000/api/v1`

Production:

`https://YOUR_APPLICATION_DOMAIN/api/v1`

During development, the Vite frontend proxies `/api` requests to the Express backend.

In production, Express serves the frontend and backend API from the same origin.

### 2.2 HTTP methods

| Method | Purpose |
|---|---|
| `GET` | Retrieve resources |
| `POST` | Create resources or perform controlled state transitions |
| `PATCH` | Partially update eligible resources |
| `DELETE` | Delete resources |

GET requests must not perform state-changing operations.

### 2.3 JSON success response

Successful JSON responses use the following structure:

```json
{
  "success": true,
  "data": {}
}
```

A `meta` property may be included when pagination or additional response metadata is required.

### 2.4 JSON error response

The standard error structure is:

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

The `details` property contains bounded field-level validation information when available.

Production errors must never expose:

- Stack traces.
- Database credentials.
- JWT values.
- Provider API keys.
- Internal filesystem paths.
- Raw database queries.
- Sensitive internal implementation details.

### 2.5 HTTP status codes

| Status | Meaning |
|---|---|
| `200 OK` | Successful read, update, or reused resource |
| `201 Created` | New resource successfully created |
| `202 Accepted` | Reserved for future asynchronous operations |
| `204 No Content` | Successful operation without response content |
| `400 Bad Request` | Invalid request or validation failure |
| `401 Unauthorized` | Authentication required or invalid |
| `403 Forbidden` | Request rejected by an access or security policy |
| `404 Not Found` | Resource does not exist or is not accessible |
| `409 Conflict` | Duplicate resource or conflicting lifecycle state |
| `413 Payload Too Large` | Request exceeds configured size limits |
| `415 Unsupported Media Type` | Unsupported uploaded file format |
| `422 Unprocessable Entity` | Semantically unsupported operation or document |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Unexpected server error |
| `503 Service Unavailable` | Required dependency unavailable |

## 3. Authentication and security

### 3.1 Authentication mechanism

ContractGuard uses JWT authentication through an HttpOnly cookie.

Cookie name:

`cg_access`

Cookie properties:

| Property | Configuration |
|---|---|
| HttpOnly | Enabled |
| Secure | Enabled in production |
| SameSite | `lax` |
| Path | `/api/v1` |
| Maximum age | 30 minutes |

The JWT uses the configured signing secret and the HS256 algorithm.

The token includes the configured issuer, audience, and authenticated user subject.

### 3.2 Authentication requirements

- The frontend must not store the JWT in localStorage or sessionStorage.
- The frontend must not read or manually decode the HttpOnly cookie.
- Protected endpoints must verify the JWT.
- The backend derives the user ID from the authenticated principal.
- The client cannot submit or override `ownerId`.
- Every protected project and child-resource request must verify ownership.

### 3.3 Request-origin protection

ContractGuard uses request-origin validation for state-changing HTTP methods.

Protected unsafe methods:

- POST
- PUT
- PATCH
- DELETE

The origin middleware:

1. Reads the Origin header when provided.
2. Validates the origin format.
3. Rejects `Origin: null`.
4. Uses Referer as a fallback when Origin is absent.
5. Compares the resulting origin with the configured `APP_ORIGIN`.
6. Rejects requests that do not match the configured application origin.

Actual origin-rejection error:

`ORIGIN_NOT_ALLOWED`

Read-only GET, HEAD, and OPTIONS requests do not require this origin validation.

### 3.4 Ownership protection

The backend applies authenticated-user ownership checks to:

- Projects.
- Specification versions.
- Comparison reports.
- Test cases.
- Other project-owned resources.

A resource ID alone is never sufficient authorization.

Where appropriate, inaccessible resources return the same safe not-found response as nonexistent resources.

## 4. Endpoint inventory

All paths in this section are relative to `/api/v1`.

### 4.1 Health endpoint

| Method | Endpoint | Authentication |
|---|---|---|
| GET | `/health/` | No |

Purpose:

Checks whether the ContractGuard API is responding.

Successful response:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "ContractGuard API"
  }
}
```

The health endpoint must not expose sensitive environment or infrastructure information.

### 4.2 Authentication endpoints

| Method | Endpoint | Authentication |
|---|---|---|
| POST | `/auth/register` | No |
| POST | `/auth/login` | No |
| POST | `/auth/logout` | No |
| GET | `/auth/me` | Yes |

#### Register

`POST /auth/register`

Request:

```json
{
  "email": "developer@example.com",
  "password": "ExamplePassword123!",
  "displayName": "Developer"
}
```

`displayName` is optional.

Backend responsibilities:

1. Validate the request.
2. Normalize the email address.
3. Validate password requirements.
4. Hash the password using the application's configured password-hashing implementation.
5. Create the user.
6. Issue the authentication cookie.
7. Return a safe public user representation.

Successful response:

`201 Created`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "USER_OBJECT_ID",
      "email": "developer@example.com",
      "displayName": "Developer",
      "createdAt": "2026-11-11T10:00:00.000Z"
    }
  }
}
```

Duplicate email:

`409 Conflict`

Error code:

`DUPLICATE_RESOURCE`

#### Login

`POST /auth/login`

Request:

```json
{
  "email": "developer@example.com",
  "password": "ExamplePassword123!"
}
```

Successful response:

`200 OK`

The backend issues the `cg_access` cookie.

Invalid credentials:

`401 Unauthorized`

Error code:

`AUTH_REQUIRED`

The response uses a generic authentication failure message.

#### Logout

`POST /auth/logout`

Purpose:

Clears the `cg_access` authentication cookie using the configured cookie attributes.

Successful response:

```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully."
  }
}
```

The current route clears the cookie without requiring an authenticated JWT.

#### Get current user

`GET /auth/me`

Requires authentication.

Returns the current authenticated account's public information.

Response:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "USER_OBJECT_ID",
      "email": "developer@example.com",
      "displayName": "Developer",
      "createdAt": "2026-11-11T10:00:00.000Z"
    }
  }
}
```

Password hashes and JWT values are never returned.

## 5. Project endpoints

All project endpoints require authentication.

### 5.1 Endpoint inventory

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/projects` | List authenticated user's projects |
| POST | `/projects` | Create a project |
| GET | `/projects/:projectId` | Retrieve a project |
| PATCH | `/projects/:projectId` | Update an owned project |
| DELETE | `/projects/:projectId` | Delete an owned project |

### 5.2 List projects

`GET /projects`

Returns projects belonging to the authenticated user.

Response:

```json
{
  "success": true,
  "data": {
    "projects": []
  }
}
```

### 5.3 Create project

`POST /projects`

Request:

```json
{
  "name": "Demo Store API",
  "description": "API compatibility and regression testing workspace."
}
```

Validation:

- Name is required.
- Name must not exceed 80 characters.
- Description must not exceed 500 characters.
- Unknown request fields are rejected.

The backend derives project ownership from the authenticated user.

Successful response:

`201 Created`

```json
{
  "success": true,
  "data": {
    "project": {
      "id": "PROJECT_OBJECT_ID",
      "name": "Demo Store API",
      "slug": "demo-store-api",
      "description": "API compatibility and regression testing workspace.",
      "createdAt": "2026-11-11T10:00:00.000Z",
      "updatedAt": "2026-11-11T10:00:00.000Z"
    }
  }
}
```

### 5.4 Retrieve project

`GET /projects/:projectId`

Returns the requested project after verifying ownership.

### 5.5 Update project

`PATCH /projects/:projectId`

Request example:

```json
{
  "name": "Demo Store API Updated",
  "description": "Updated project description."
}
```

At least one valid field must be provided.

Only the project owner can update the project.

### 5.6 Delete project

`DELETE /projects/:projectId`

The current implementation performs project deletion together with dependent project records inside a MongoDB transaction.

The service attempts to remove associated dependent collections before removing the project itself.

Successful response:

```json
{
  "success": true,
  "data": {
    "project": {},
    "message": "Project deleted successfully."
  }
}
```

Deletion is not a soft-delete operation in the current Phase 5 implementation.

Historical retention and permanent deletion policies must therefore be considered together when changing this behavior.

## 6. Specification management endpoints

### 6.1 Endpoint inventory

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/projects/:projectId/specifications` | Upload an OpenAPI specification |
| GET | `/projects/:projectId/specifications` | List specification versions |
| GET | `/specifications/:specVersionId` | Retrieve a specification version |

All endpoints require authentication and appropriate project/resource ownership checks.

### 6.2 Upload specification

`POST /projects/:projectId/specifications`

Content type:

`multipart/form-data`

Required file field:

`file`

Optional text field:

`label`

Supported extensions:

- `.json`
- `.yaml`
- `.yml`

Maximum file size:

`1 MiB`

Additional limits:

- Exactly one uploaded file.
- At most one text field.
- Bounded multipart field size.
- UTF-8 text decoding is enforced.
- Invalid UTF-8 files are rejected.

If `label` is omitted, the service uses the document's OpenAPI `info.version` as the default label.

The uploaded filename and MIME type are not accepted as proof that the document is valid.

### 6.3 Upload processing

The backend performs the following operations:

1. Authenticate the user.
2. Validate project ownership.
3. Process the bounded multipart request.
4. Read the uploaded file buffer.
5. Decode UTF-8 content.
6. Determine the supported format from its extension.
7. Parse and validate the OpenAPI document.
8. Calculate the SHA-256 content hash.
9. Check for duplicate content in the project.
10. Check for duplicate version labels.
11. Validate the project again inside the transaction.
12. Persist the immutable specification version.
13. Update project activity.
14. Return the public specification summary.

External `$ref` resources are not fetched.

Uploaded OpenAPI server declarations are not contacted.

### 6.4 Successful upload response

`201 Created`

```json
{
  "success": true,
  "data": {
    "specification": {
      "id": "SPEC_VERSION_OBJECT_ID",
      "label": "1.0.0",
      "openapiVersion": "3.2.1",
      "title": "Demo Store API",
      "sourceFormat": "yaml",
      "operationCount": 12,
      "parseStatus": "VALID",
      "explorerCompleteness": "COMPLETE",
      "warnings": [],
      "explorerWarnings": [],
      "createdAt": "2026-11-11T10:00:00.000Z"
    }
  }
}
```

This response illustrates the public structure. Actual operation counts and warning values depend on the uploaded specification.

### 6.5 Duplicate specification upload

Uploading identical source content to the same project is rejected.

Error code:

`DUPLICATE_RESOURCE`

Duplicate version labels are also rejected.

### 6.6 List specification versions

`GET /projects/:projectId/specifications`

Returns the specification versions associated with an owned project.

The response includes:

- Version identifier.
- Label.
- OpenAPI version.
- Title.
- Source format.
- Operation count.
- Parse status.
- Explorer completeness.
- Warnings.
- Creation timestamp.

### 6.7 Retrieve specification version

`GET /specifications/:specVersionId`

Returns a safe specification version detail object.

The response may include the stored parsed document required by the API Explorer.

The endpoint does not expose arbitrary filesystem paths or execute document content.

## 7. API Explorer endpoints

All API Explorer endpoints require authentication and specification-version access validation.

### 7.1 Endpoint inventory

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/specifications/:specVersionId/operations` | List extracted operations |
| GET | `/specifications/:specVersionId/operations/:operationKey` | Retrieve operation detail |
| GET | `/specifications/:specVersionId/components/:componentType` | List reusable components |
| GET | `/specifications/:specVersionId/components/:componentType/:componentName` | Retrieve reusable component |
| GET | `/specifications/:specVersionId/references?ref=...` | Resolve an internal reference |

### 7.2 List operations

`GET /specifications/:specVersionId/operations`

Returns the available extracted operations.

A public operation representation includes:

- Canonical operation key.
- Original path.
- HTTP method.
- Operation summary.
- Description where available.
- Relevant support information.

Canonical operation keys follow the format:

`op_` followed by a SHA-256-derived base64url identifier.

The frontend must use the returned operation key rather than generating one independently.

### 7.3 Retrieve operation

`GET /specifications/:specVersionId/operations/:operationKey`

Returns the selected operation details.

Supported information may include:

- HTTP method.
- Original path.
- Operation metadata.
- Effective parameters.
- Request body.
- Response definitions.
- Referenced schemas.
- Source JSON Pointers.
- Relevant support warnings.

An invalid or inaccessible operation returns a safe resource error.

### 7.4 List components

`GET /specifications/:specVersionId/components/:componentType`

Lists reusable components of an accepted OpenAPI component category.

Component types are validated against the application's supported OpenAPI component-type allowlist.

### 7.5 Retrieve a component

`GET /specifications/:specVersionId/components/:componentType/:componentName`

Returns one component after validating the component type and name.

### 7.6 Resolve an internal reference

`GET /specifications/:specVersionId/references?ref=%23%2Fcomponents%2Fschemas%2FProduct`

The `ref` query parameter must:

- Be present.
- Be non-empty.
- Begin with `#`.
- Not exceed 2,000 characters.
- Represent an allowed internal reference.

External URLs and external relative-file references are not accepted.

The response contains reference-resolution information supported by the specification explorer.

## 8. Compatibility comparison endpoints

### 8.1 Endpoint inventory

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/projects/:projectId/diff-reports` | Create a comparison report |
| GET | `/projects/:projectId/diff-reports` | List comparison reports |
| GET | `/projects/:projectId/diff-reports/:reportId` | Retrieve a comparison report |

All comparison endpoints require authentication and project ownership validation.

The project identifier is part of every comparison endpoint. The report must belong to that project.

### 8.2 Create comparison

`POST /projects/:projectId/diff-reports`

Request:

```json
{
  "baselineVersionId": "BASELINE_SPEC_VERSION_OBJECT_ID",
  "candidateVersionId": "CANDIDATE_SPEC_VERSION_OBJECT_ID"
}
```

For compatibility with earlier Phase 4 clients, the following legacy field names are also accepted:

```json
{
  "baselineSpecVersionId": "BASELINE_SPEC_VERSION_OBJECT_ID",
  "candidateSpecVersionId": "CANDIDATE_SPEC_VERSION_OBJECT_ID"
}
```

New clients should use `baselineVersionId` and `candidateVersionId`.

Validation requirements:

- Both IDs must be valid MongoDB ObjectIds.
- Baseline and candidate must be different.
- Both versions must belong to the same project.
- The project must belong to the authenticated user.
- Both specification documents must be available and valid.

The backend controls the comparison direction and ruleset version.

Comparison direction:

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

Ruleset:

`CG-COMPAT-1.1`

### 8.3 Comparison creation response

A newly generated report returns:

`201 Created`

A reused existing comparison report returns:

`200 OK`

Illustrative response:

```json
{
  "success": true,
  "data": {
    "diffReport": {
      "id": "DIFF_REPORT_OBJECT_ID",
      "projectId": "PROJECT_OBJECT_ID",
      "baselineVersionId": "BASELINE_VERSION_OBJECT_ID",
      "candidateVersionId": "CANDIDATE_VERSION_OBJECT_ID",
      "direction": "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
      "rulesetVersion": "CG-COMPAT-1.1",
      "analysisStatus": "COMPLETE",
      "summary": {
        "breaking": 1,
        "potentiallyBreaking": 0,
        "nonBreaking": 2,
        "informational": 1,
        "unsupported": 0
      },
      "changes": [],
      "warnings": [],
      "createdAt": "2026-11-11T10:30:00.000Z"
    },
    "reused": false
  }
}
```

All values are illustrative.

### 8.4 Comparison deduplication

The backend uses a SHA-256-based analysis fingerprint derived from:

- Project ID.
- Baseline content hash.
- Candidate content hash.
- Analyzer version.
- Ruleset version.

If an existing report with the same fingerprint is found, it can be reused instead of producing a duplicate report.

### 8.5 List comparisons

`GET /projects/:projectId/diff-reports`

Optional query parameter:

`limit`

Default:

`20`

Maximum:

`50`

Example:

`GET /projects/PROJECT_ID/diff-reports?limit=20`

The response contains:

- Report ID.
- Baseline version reference.
- Candidate version reference.
- Version labels.
- Comparison direction.
- Ruleset version.
- Analysis status.
- Classification summary.
- Creation timestamp.

### 8.6 Retrieve comparison report

`GET /projects/:projectId/diff-reports/:reportId`

Returns the requested report after validating project ownership.

In the Phase 6 integration, report retrieval also derives the current test-coverage projection using the baseline test-case library.

The stored comparison findings are not rewritten to store mutable test-coverage data.

### 8.7 Report classifications

Each change can contain:

- `changeId`
- `ruleId`
- `classification`
- `operationKey`
- `affectedOperationKeys`
- `jsonPointer`
- `summary`
- `rationale`

Classification values:

- `BREAKING`
- `POTENTIALLY_BREAKING`
- `NON_BREAKING`
- `INFORMATIONAL`
- `UNSUPPORTED`

Analysis status values:

- `COMPLETE`
- `PARTIAL`
- `FAILED`

Unsupported relevant constructs must not be silently considered compatible.

## 9. Phase 6 — Test-case endpoints

These routes form the Phase 6 test-case management API.

All routes require authentication and validate access to the associated project/specification version.

### 9.1 Endpoint inventory

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/specifications/:specVersionId/test-cases` | List cases for a specification version |
| POST | `/specifications/:specVersionId/test-cases` | Create a manual draft test case |
| GET | `/test-cases/:testCaseId` | Retrieve a test case |
| PATCH | `/test-cases/:testCaseId` | Update a draft test case |
| POST | `/test-cases/:testCaseId/approve` | Approve a draft |
| POST | `/test-cases/:testCaseId/archive` | Archive a case |

### 9.2 List test cases

`GET /specifications/:specVersionId/test-cases`

Returns test cases associated with the requested specification version.

The response includes:

- Test-case identifier.
- Project ID.
- Specification version ID.
- Operation key.
- Operation path.
- Title and description.
- Source.
- Lifecycle status.
- Request inputs.
- Assertions.
- Creation and modification timestamps.
- Approval timestamp where applicable.

The current service returns up to 500 records per specification version.

Archived cases may be returned in the library but are excluded from live coverage calculations.

### 9.3 Create manual test case

`POST /specifications/:specVersionId/test-cases`

Creates a new test case in `DRAFT` status.

V1 manual test-case support is deliberately restricted to GET path operations.

Request:

```json
{
  "operationKey": "op_REPLACE_WITH_VALID_OPERATION_KEY",
  "operationPath": "/products/{productId}",
  "title": "Retrieve an existing product",
  "description": "Verify retrieval of an existing product.",
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

`operationKey` must be the exact canonical key returned by the baseline specification's API Explorer. The illustrative placeholder is not a valid operation key.

The backend independently verifies:

- Specification-version ownership.
- Project ownership.
- Operation existence.
- GET method.
- Path equality.
- Declared path parameter names.
- Declared query parameter names.
- All required path values.
- All required query values.
- Input count and value-length limits.
- Assertion structure.

Only `pathParams` and `queryParams` are permitted in the request object.

The following are rejected:

- Arbitrary URL fields.
- Arbitrary hostnames.
- Custom execution targets.
- Custom request headers.
- Arbitrary credentials.
- Request-body execution fields.
- Unknown request properties.

Successful response:

`201 Created`

```json
{
  "success": true,
  "data": {
    "testCase": {
      "id": "TEST_CASE_OBJECT_ID",
      "projectId": "PROJECT_OBJECT_ID",
      "specVersionId": "SPEC_VERSION_OBJECT_ID",
      "operationKey": "op_REPLACE_WITH_VALID_OPERATION_KEY",
      "operationPath": "/products/{productId}",
      "title": "Retrieve an existing product",
      "description": "Verify retrieval of an existing product.",
      "source": "MANUAL",
      "status": "DRAFT",
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
      },
      "approvedAt": null
    }
  }
}
```

### 9.4 Retrieve test case

`GET /test-cases/:testCaseId`

Returns a test case after verifying that its associated specification version belongs to the authenticated user's project.

Inaccessible or nonexistent records return:

`404 Not Found`

### 9.5 Update draft test case

`PATCH /test-cases/:testCaseId`

Only `DRAFT` cases can be edited.

Supported fields:

- `title`
- `description`
- `request`
- `assertions`

Example:

```json
{
  "title": "Retrieve an existing product successfully",
  "description": "Updated verification description."
}
```

The backend rejects:

- Empty update bodies.
- Unknown fields.
- Attempts to modify immutable operation references.
- Attempts to modify specification-version ownership.
- Attempts to change the test-case source.
- Attempts to directly set lifecycle status.
- Attempts to edit approved or archived cases.

Successful response:

`200 OK`

Attempting to edit a case that is no longer a draft returns:

`409 Conflict`

Error code:

`TEST_CASE_STATE_CONFLICT`

### 9.6 Approve test case

`POST /test-cases/:testCaseId/approve`

Approves an eligible draft after validating its baseline operation and request inputs again.

Lifecycle transition:

`DRAFT → APPROVED`

The server sets `approvedAt`.

The client cannot directly approve a test case through a PATCH status field.

Trying to approve an already approved or archived case returns a state conflict.

### 9.7 Archive test case

`POST /test-cases/:testCaseId/archive`

Allowed transitions:

- `DRAFT → ARCHIVED`
- `APPROVED → ARCHIVED`

Archived cases become read-only and do not contribute to live comparison coverage.

Archiving preserves the test-case record for historical reference.

Repeated archive requests return the existing archived representation.

## 10. Change-to-test coverage API projection

Coverage is part of comparison retrieval.

It is not a separately persisted mutable copy of test-case information.

### 10.1 Affected operations

Each supported comparison finding contains its affected baseline operation keys.

These keys are generated by the comparison and reference-impact logic.

The traceability service matches these keys against test cases associated with the exact baseline specification version.

### 10.2 Coverage calculation

The calculation operates independently for every affected baseline operation.

| Condition | Result |
|---|---|
| Every affected operation has at least one approved case | `COVERED` |
| Every affected operation has a case, but at least one has drafts only | `DRAFT_ONLY` |
| At least one affected operation has no active linked case | `UNCOVERED` |
| No affected operation key exists | `UNMAPPED` |

Archived cases are ignored.

One approved test case for one operation cannot cover a change affecting multiple operations if another affected operation has no approved case.

### 10.3 Per-change coverage projection

The comparison response may include:

```json
{
  "testCoverage": {
    "affectedOperationCount": 2,
    "coveredOperationCount": 1,
    "draftOnlyOperationCount": 0,
    "uncoveredOperationCount": 1,
    "totalLinkedTestCases": 2,
    "approvedCount": 1,
    "draftCount": 1,
    "coverageStatus": "UNCOVERED",
    "linkedTestCases": []
  }
}
```

The example illustrates an incomplete state; actual linked case details are supplied by the service.

### 10.4 Coverage summary

The report-level coverage summary may contain:

```json
{
  "totalChanges": 8,
  "affectedChanges": 6,
  "coveredChanges": 2,
  "draftOnlyChanges": 1,
  "uncoveredChanges": 3,
  "unmappedChanges": 2
}
```

These values are illustrative.

### 10.5 Important distinction

Coverage represents the availability of suitable test cases.

It does not represent:

- Successful test execution.
- Candidate response validation.
- Runtime compatibility.
- Production API health.

Those outcomes require a separate regression-run implementation.

## 11. Validation and input constraints

All incoming API requests must be validated on the backend.

Zod provides request-shape validation, while Mongoose provides an additional persistence-level safeguard.

### 11.1 General validation

- Validate ObjectIds before database access.
- Reject unknown security-sensitive fields.
- Apply explicit string length restrictions.
- Limit array sizes.
- Validate enums.
- Validate operation references.
- Verify resource ownership.
- Avoid mass assignment through direct client-object updates.

### 11.2 Upload validation

| Constraint | Limit |
|---|---:|
| File size | 1 MiB |
| File count | 1 |
| Accepted extensions | `.json`, `.yaml`, `.yml` |
| Encoding | UTF-8 |
| Version label | Maximum 80 characters |

The backend derives the source format from the validated filename extension and processes the actual uploaded file contents.

### 11.3 Test-case validation

| Constraint | Limit |
|---|---:|
| Test cases per specification version | 500 |
| Path and query entries combined | 20 |
| Parameter value length | 256 characters |
| Title length | 120 characters |
| Description length | 1,000 characters |
| Property assertions | 20 |
| Required-property assertions | 20 |

Additional restrictions:

- GET path operations only.
- Required path and query parameters must be provided.
- Parameter names must exist in the baseline operation.
- Property assertion paths are restricted to safe dot-separated property names.
- Assertion payloads must remain bounded JSON values.
- Arbitrary URLs and executable inputs are rejected.

## 12. Error-code catalogue

| Error code | HTTP status | Meaning |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_JSON` | 400 | Request body contains malformed JSON |
| `AUTH_REQUIRED` | 401 | Authentication is missing or invalid |
| `ORIGIN_NOT_ALLOWED` | 403 | Request origin validation failed |
| `RESOURCE_NOT_FOUND` | 404 | Resource missing or not accessible |
| `DUPLICATE_RESOURCE` | 409 | Duplicate project-scoped resource |
| `TEST_CASE_STATE_CONFLICT` | 409 | Invalid test-case lifecycle operation |
| `PAYLOAD_TOO_LARGE` | 413 | JSON request body exceeds the configured limit |
| `SPEC_LIMIT_EXCEEDED` | 413 | Specification upload exceeds its limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Unsupported uploaded file format |
| `DIFF_REPORT_TOO_LARGE` | 413 | Comparison report exceeds its storage limit |
| `SERVICE_UNAVAILABLE` | 503 | Required service unavailable |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

Additional application-level error codes may be introduced when implementing subsequent features.

Error codes must remain consistent with the actual `AppError`, validation middleware, and centralized error handler.

## 13. Rate limiting

The authentication layer applies separate rate-limit policies to:

- Account registration.
- Login attempts.

Sensitive endpoints must remain protected against brute-force attempts and abusive requests.

Additional limits should be introduced where justified by actual resource consumption.

Do not depend on frontend-only rate limiting.

## 14. API implementation boundaries

### 14.1 Implemented baseline API

The Phase 5 backend provides:

- Health.
- Authentication.
- Projects.
- Specification upload and retrieval.
- Specification operation exploration.
- Reusable component browsing.
- Internal reference resolution.
- Compatibility comparison creation.
- Comparison history and retrieval.

### 14.2 Phase 6 test-case API

The Phase 6 source implementation adds:

- Baseline-version test-case listing.
- Manual test-case creation.
- Test-case retrieval.
- Draft editing.
- Approval.
- Archiving.
- Live comparison coverage projection.

These additions require the dedicated integration suite and local runtime validation before they can be treated as fully accepted.

### 14.3 Future API capabilities

The following are outside the current implemented API:

- General-purpose external API execution.
- Regression-run creation and execution.
- Test-run result retrieval.
- User-controlled runner target configuration.
- AI-assisted test generation.
- AI provider management.
- CI gating and GitHub integration.
- Team and organization management.

No endpoint should be documented as implemented until the corresponding route, validator, controller, service, and integration tests exist.

## 15. API compatibility and versioning policy

The current application API uses:

`/api/v1`

Changes to existing request or response structures must be deliberate.

Guidelines:

- Preserve existing response envelope conventions.
- Avoid changing established resource identifiers.
- Maintain backward-compatible field aliases only when a migration requires them.
- Document deprecated request names.
- Validate unknown fields to prevent accidental mass assignment.
- Introduce a new API major version only when backward-incompatible changes justify it.

The uploaded OpenAPI document's version is independent of the ContractGuard application API version.

## 16. API acceptance criteria

The API contract is accepted when:

1. Protected endpoints require valid authentication.
2. Project and child-resource ownership checks are enforced.
3. Request-origin validation protects state-changing requests.
4. Specification uploads are bounded and validated.
5. External references and uploaded server URLs are never fetched.
6. Specification versions preserve their original content and hashes.
7. API Explorer routes return supported operation and component details.
8. Comparisons record their server-defined direction and ruleset.
9. Comparison findings expose stable change IDs and rule information.
10. Shared-schema findings retain supported affected-operation keys.
11. Test cases belong to an exact baseline specification version.
12. Test-case lifecycle transitions are enforced server-side.
13. Approved cases cannot be silently edited.
14. Coverage is derived from current baseline test cases.
15. A change is covered only when every affected operation has an approved linked case.
16. Archived cases do not count toward coverage.
17. Historical comparison findings are not rewritten by live coverage calculations.
18. Errors remain structured and do not leak sensitive implementation details.
19. All implemented endpoint workflows have backend integration-test coverage.

## 17. Official technical references

- Express documentation: https://expressjs.com/
- Mongoose documentation: https://mongoosejs.com/docs/
- Zod documentation: https://zod.dev/
- OpenAPI Specification: https://spec.openapis.org/oas/v3.2.1.html
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
