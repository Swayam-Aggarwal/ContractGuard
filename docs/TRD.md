# Technical Requirements Document (TRD)

**Product:** ContractGuard
**Version:** 1.1
**Last Updated:** 11 November 2026

## 1. Technical Objectives

ContractGuard is implemented as a JavaScript-based web application for API specification management, compatibility analysis, change-impact analysis, and test-case management.

The technical implementation must prioritize:

- Clear separation of frontend and backend responsibilities.
- Maintainable and modular application architecture.
- Deterministic compatibility analysis.
- Secure specification upload and processing.
- Reliable database relationships and historical records.
- Automated testing of critical functionality.
- Bounded processing and execution limits.
- Minimal unnecessary infrastructure.

TypeScript, microservices, and distributed execution infrastructure are outside the current implementation scope.

## 2. Technology Stack

### 2.1 Frontend

| Technology | Purpose |
|---|---|
| React | User interface |
| JavaScript | Application programming language |
| Vite | Development server and production build |
| React Router | Client-side routing |
| Tailwind CSS | Styling |
| TanStack Query | Server-state management |
| React Hook Form | Form management |
| Zod | Client-side validation |
| Lucide React | Icons |

### 2.2 Backend

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | HTTP server and API |
| MongoDB | Persistent database |
| Mongoose | Database modelling and queries |
| bcrypt | Password hashing |
| jsonwebtoken | JWT authentication |
| cookie-parser | Cookie handling |
| helmet | HTTP security headers |
| express-rate-limit | Request rate limiting |
| Multer | File uploads |
| Zod | Request validation |
| YAML | YAML parsing |
| @scalar/openapi-parser | OpenAPI parsing |
| Ajv | JSON Schema validation |

### 2.3 Development and Testing Tools

| Tool | Purpose |
|---|---|
| Git | Version control |
| GitHub | Repository hosting |
| Postman | API testing |
| Vitest | Automated testing |
| Supertest | HTTP integration testing |
| ESLint | Code quality |
| npm | Dependency management |
| Visual Studio Code | Development environment |

Exact dependency versions are maintained in the respective package manifests and lockfiles.

Dependency upgrades must be deliberate and compatible with the existing application.

## 3. Application Architecture

ContractGuard follows a modular monolith architecture.

The frontend and backend are maintained as separate application directories within one repository.

The backend contains domain-specific services responsible for specification processing, compatibility analysis, change impact, and test-case management.

### 3.1 High-level Architecture

```text
                 React Frontend
                       |
                       |
                HTTP API Requests
                       |
                       v
                Express Backend
                       |
                Routes and Middleware
                       |
                       v
                   Controllers
                       |
                       v
                    Services
                       |
          +------------+------------+
          |            |            |
          v            v            v
     OpenAPI       Compatibility   Test Case
     Processing      Analysis      Management
          |            |            |
          +------------+------------+
                       |
                       v
                    Mongoose
                       |
                       v
                    MongoDB
```

### 3.2 Frontend Responsibilities

The frontend handles:

- User authentication interfaces.
- Project management interfaces.
- Specification upload and exploration.
- Comparison report presentation.
- Compatibility finding inspection.
- Change-impact visualization.
- Test-case creation and management.
- Coverage information.
- Loading, empty, success, and error states.

The frontend must not make authoritative authorization or compatibility-classification decisions.

### 3.3 Backend Responsibilities

The backend handles:

- Authentication and authorization.
- Request validation.
- File upload and document parsing.
- Specification normalization.
- Compatibility analysis.
- Operation matching.
- Shared-schema impact analysis.
- Test-case lifecycle management.
- Coverage calculation.
- Database persistence.
- Security middleware and error handling.

The backend is the source of truth for business logic.

## 4. Frontend Technical Requirements

### 4.1 React

Use functional React components and hooks.

Keep components focused on their responsibilities.

Reusable UI components should remain separate from feature-specific application logic.

### 4.2 Routing

Use React Router for navigation between application pages.

Protected routes must require authenticated access.

The application must preserve the project context when navigating between specifications, comparisons, reports, and test cases.

### 4.3 Server-State Management

Use TanStack Query for API-backed data.

This includes:

- Account information.
- Project records.
- Specification versions.
- Comparison reports.
- Test cases.
- Coverage information.

Successful mutations should invalidate or update relevant queries so that displayed information remains consistent.

Avoid maintaining unnecessary duplicate copies of server data in component state.

### 4.4 Forms and Validation

Use React Hook Form for form state and Zod for client-side validation.

Client validation improves usability but does not replace backend validation.

Every request must be independently validated by the server.

### 4.5 Styling

Use Tailwind CSS and the existing application styling architecture.

Maintain consistent spacing, typography, colors, component behavior, and responsive layouts.

Do not introduce an additional styling framework without a specific requirement.

## 5. Backend Technical Requirements

### 5.1 Express Application

Express is responsible for:

- API routing.
- Middleware execution.
- Authentication.
- Request validation.
- Controller execution.
- Error handling.
- Production frontend serving.

Routes should define endpoint mappings, controllers should coordinate requests, and services should contain business logic.

### 5.2 Database

Use MongoDB with Mongoose.

The application uses the following principal collections:

- `users`
- `projects`
- `specVersions`
- `diffReports`
- `testCases`

The `testRuns` collection is reserved for the planned regression-runner implementation.

Collection structures, relationships, indexes, and constraints are documented in `Schema.md`.

### 5.3 Authentication

Use bcrypt for password hashing and `jsonwebtoken` for JWT authentication.

Authentication requirements:

- Passwords must never be stored in plaintext.
- Password hashes must not be returned in API responses.
- JWT authentication uses an HttpOnly cookie.
- Authentication cookies must have appropriately configured security attributes.
- Logout must clear the authentication cookie.
- Protected endpoints must verify the authenticated user.
- The frontend must not store authentication tokens in local storage.

### 5.4 Authorization

Authorization must be enforced on the backend.

Every project belongs to an authenticated user.

Every child-resource request must verify ownership through its parent project.

The backend must not trust client-supplied owner identifiers.

### 5.5 Error Handling

Use centralized error-handling middleware.

Errors should have consistent response structures and appropriate HTTP status codes.

The application must:

- Avoid exposing stack traces in production responses.
- Avoid leaking database implementation details.
- Return useful validation errors.
- Distinguish authentication, authorization, resource, and server errors.
- Log sufficient diagnostic information without exposing secrets.

## 6. OpenAPI Specification Processing

### 6.1 Supported Formats

The application accepts:

- JSON.
- YAML.

Only valid and supported OpenAPI specification versions should be accepted for the corresponding workflows.

### 6.2 Parsing

Use `@scalar/openapi-parser` for OpenAPI parsing and structural validation.

Parsing and compatibility support are separate concerns. A document may parse successfully while containing constructs that the analysis engine cannot fully evaluate.

### 6.3 Processing Pipeline

```text
Specification Upload
        |
        v
File Validation
        |
        v
Format Detection
        |
        v
JSON/YAML Parsing
        |
        v
OpenAPI Version Validation
        |
        v
Structural Validation
        |
        v
Supported-Feature Inspection
        |
        v
Normalization
        |
        v
Operation and Schema Extraction
        |
        v
Persistence
```

### 6.4 Upload Security

- Enforce the configured maximum upload size.
- Accept only supported document formats.
- Do not trust client-provided filenames or MIME types.
- Parse YAML using safe configuration.
- Disable YAML alias expansion.
- Reject unsupported YAML tags and duplicate mapping keys.
- Enforce document depth and parsed-node limits.
- Calculate SHA-256 from the original uploaded bytes.
- Do not execute uploaded content.
- Do not fetch external references or declared server URLs.

### 6.5 Reference Handling

Support internal references within the implemented reference-resolution subset.

The implementation must:

- Detect circular references.
- Enforce reference-depth limits.
- Handle unresolved references explicitly.
- Avoid unbounded schema expansion.
- Report unsupported reference behavior.
- Never fetch remote `$ref` resources.

## 7. Compatibility Analysis Engine

### 7.1 Purpose

The compatibility engine compares a baseline specification against a candidate specification.

The comparison direction is:

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

The baseline represents the existing consumer contract. The candidate represents the updated provider contract.

### 7.2 Implementation Requirements

The engine must:

- Compare supported API operations.
- Match operations using canonical method and path identifiers.
- Identify supported request and response contract changes.
- Apply deterministic compatibility rules.
- Assign stable rule identifiers.
- Classify findings.
- Generate explanatory messages.
- Identify affected operations.
- Report unsupported analysis constructs.

### 7.3 Ruleset

The initial ruleset identifier is:

`CG-COMPAT-1.1`

Supported finding classifications:

- `BREAKING`
- `POTENTIALLY_BREAKING`
- `NON_BREAKING`
- `INFORMATIONAL`
- `UNSUPPORTED`

Analysis statuses:

- `COMPLETE`
- `PARTIAL`
- `FAILED`

The complete compatibility-rule definitions are maintained in `Rules.md`.

### 7.4 Determinism

Given identical normalized baseline and candidate specifications and the same ruleset:

- Operation matching must remain consistent.
- Finding identifiers must remain stable.
- Rule assignments must remain consistent.
- Classifications must remain consistent.
- Findings must follow a deterministic ordering.

Random values must not influence compatibility decisions.

### 7.5 Shared-Schema Impact

The engine must track supported internal schema references.

When a shared schema changes, it should identify the affected operations through the supported reference graph.

Affected canonical operation keys are used for test-case traceability.

Unresolved, circular, external, or bounded-out references must produce appropriate warnings and partial-analysis status.

The current implementation uses conservative impact propagation within supported operation scopes. It must not claim exact pointer-level attribution when the available reference information cannot establish it.

## 8. Change-to-Test Traceability

Each comparison finding should identify the operations affected by the change.

The traceability service matches affected operation keys against test cases belonging to the comparison's baseline specification version.

Coverage states:

| State | Meaning |
|---|---|
| `COVERED` | Every affected operation has an approved linked test case. |
| `DRAFT_ONLY` | Every affected operation has a linked case, but at least one is covered only by drafts. |
| `UNCOVERED` | At least one affected operation has no linked test case. |
| `UNMAPPED` | The finding cannot be reliably mapped to an affected operation. |

Coverage must:

- Be calculated at operation level.
- Ignore archived test cases.
- Distinguish approved and draft cases.
- Support changes affecting multiple operations.
- Remain separate from actual execution results.

Coverage indicates test availability, not successful regression execution.

## 9. Test Case Management

Test cases are associated with a specific baseline specification version and canonical operation key.

Supported lifecycle states:

- `DRAFT`
- `APPROVED`
- `ARCHIVED`

Requirements:

- Users can create and inspect test cases.
- Draft cases can be updated.
- Approval must be a server-controlled transition.
- Approved cases must not be silently modified.
- Corrections to approved cases require a new draft.
- Archived cases must not count toward active coverage.
- Test-case ownership and baseline-version relationships must be validated.

The Phase 6 implementation covers test-case management and traceability. Actual regression execution remains a separate development phase.

## 10. Planned Regression Runner

The regression runner is a planned extension, not part of the current Phase 6 implementation.

Its purpose is to execute approved baseline test cases against the bundled candidate Demo Store implementation.

### 10.1 Execution Architecture

Use a server-controlled, in-process adapter.

The runner must not operate as an unrestricted external HTTP proxy.

Execution must be restricted to:

- Recognized bundled candidate fixtures.
- Approved test cases.
- Supported GET operations.
- Validated path and query parameters.

### 10.2 Response Validation

The candidate implementation supplies the response.

The baseline specification defines the expected consumer contract.

Therefore, candidate responses must be validated against the baseline response schema.

Use Ajv with the appropriate normalization for supported OpenAPI schema dialects.

Unsupported response-schema constructs must not be reported as complete validation passes.

### 10.3 Execution Limits

Initial proposed limits:

| Resource | Limit |
|---|---:|
| Test cases per run | 20 |
| Concurrent runs | 2 |
| Concurrent tests per run | 2 |
| Per-test timeout | 5 seconds |
| Total run deadline | 60 seconds |
| Response body | 256 KiB |
| Stored evidence per result | 16 KiB |

The backend must enforce these limits.

### 10.4 Execution Safety

- No arbitrary target URLs.
- No client-controlled hostnames or network destinations.
- No arbitrary executable test code.
- No user-supplied authentication credentials.
- No execution of unapproved test cases.
- No execution of unsupported HTTP methods.

## 11. Planned AI Integration

AI-assisted test generation is an optional future capability.

It must not be required for authentication, specification management, compatibility analysis, or test-case management.

Requirements:

- Provider access remains server-side.
- Provider credentials are stored only in environment configuration.
- The user must explicitly consent before data is submitted externally.
- Free-tier requests must use approved bundled synthetic specifications only.
- Arbitrary uploaded specifications and production data must not be sent.
- AI output must be validated using Zod.
- Generated test cases must begin as drafts.
- Human approval is required before a suggestion becomes eligible for execution.
- AI must not determine compatibility classifications or test pass/fail results.
- The application must remain fully usable without AI configuration.

## 12. Security Requirements

The application must enforce the following boundaries:

- bcrypt password hashing.
- JWT authentication through HttpOnly cookies.
- Server-side project ownership checks.
- Request validation.
- Upload-size restrictions.
- Safe JSON and YAML parsing.
- Internal-only reference resolution.
- Rate limiting on sensitive endpoints.
- Appropriate HTTP security headers.
- Secure error handling.
- No arbitrary network execution.
- No exposure of authentication credentials or API keys.
- No client-controlled execution targets.

Unsafe cookie-authenticated requests must receive appropriate CSRF or origin protection.

## 13. Testing Requirements

Automated tests must cover:

### Unit Testing

- Validators.
- Service functions.
- Operation matching.
- Compatibility rules.
- Shared-schema impact analysis.
- Traceability calculations.
- Test-case lifecycle transitions.

### Integration Testing

- Authentication endpoints.
- Project ownership.
- Specification upload.
- Specification retrieval.
- Comparison creation and retrieval.
- Change-to-test traceability.
- Test-case creation, approval, update, and archival.

### Frontend Verification

- ESLint checks.
- Production build.
- Primary navigation.
- Core form workflows.
- Comparison and test-case screens.
- Loading and error states.

### Regression Testing

Every supported compatibility rule must have appropriate fixtures.

Unsupported constructs must have explicit tests to ensure they do not silently produce complete analysis results.

## 14. Runtime and Configuration

The application uses Node.js and npm.

Environment-specific configuration belongs in environment files and must not be committed with real credentials.

Configuration must cover the requirements of:

- MongoDB connection.
- JWT signing and verification.
- Cookie security.
- Frontend origin and application environment.
- Upload and parser limits.
- Rate limits.
- Optional AI provider access.

The application must fail safely when required configuration is missing.

Secrets must never be hardcoded into frontend source code.

## 15. Development and Production Architecture

### Development

- Vite runs the React application.
- Express runs the backend API.
- Vite proxies API requests to Express.
- MongoDB stores application records.

### Production

- The React frontend is built into static assets.
- Express serves the built frontend and API.
- The browser communicates through the same application origin.
- MongoDB remains the persistent database.

The initial architecture does not require microservices, a separate API gateway, or distributed background workers.

## 16. Technical Acceptance Criteria

The technical implementation is accepted when:

1. Frontend and backend responsibilities remain separated.
2. Authentication and ownership checks are enforced server-side.
3. Specification uploads are bounded and safely processed.
4. Original specification content and hashes are preserved.
5. Supported OpenAPI constructs are normalized consistently.
6. Compatibility results are deterministic.
7. Unsupported constructs are explicitly reported.
8. Shared-schema changes identify supported affected operations.
9. Test cases are associated with their correct baseline specification versions.
10. Coverage calculations distinguish all four supported states.
11. Test-case lifecycle transitions are validated.
12. Historical comparison findings remain unchanged.
13. Automated tests cover critical backend workflows.
14. Frontend linting and production builds complete successfully.
15. Planned runner and AI capabilities are not represented as completed functionality before their implementation and validation.
