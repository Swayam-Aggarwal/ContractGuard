
# Technical Requirements Document (TRD)

**Product:** ContractGuard  
**Document version:** 1.1  
**Status:** Revised technical baseline  
**Last reviewed:** 7 November 2026

## 1. Technical objectives

ContractGuard must be achievable by one developer with existing JavaScript, React, Node.js, Express, MongoDB, and SQL fundamentals.

The implementation must demonstrate meaningful engineering work without introducing unnecessary infrastructure or technologies that do not contribute directly to the product.

The architecture must maintain clear separation between:

- Frontend presentation and interaction.
- Authentication and authorization.
- OpenAPI document ingestion and parsing.
- OpenAPI version and dialect normalization.
- Deterministic compatibility analysis.
- Change-to-test traceability.
- Baseline response-schema validation.
- Bounded regression execution.
- Optional AI-assisted test suggestions.
- Persistence and historical reporting.

The selected approach is a JavaScript React single-page application and an Express modular monolith backed by MongoDB.

No distributed infrastructure is required for v1.

## 2. Runtime and framework baseline

### 2.1 Runtime versions

| Component | Baseline | Notes |
|---|---|---|
| Node.js | 24.x | Existing project runtime; Maintenance LTS, supported through April 2028 |
| npm | 11.x | Use the npm version compatible with the selected Node installation |
| JavaScript | Modern ECMAScript with ES modules | TypeScript is excluded from v1 |

Node.js 26 entered Active LTS on 28 October 2026. Node.js 24 moved into Maintenance LTS on 20 October 2026.

ContractGuard will remain on Node.js 24 for the initial implementation because the existing development environment already uses it, it remains supported, and the selected dependencies support the Node 24 line.

Use the latest suitable Node 24 patch release available at implementation time. The latest release observed during this review is Node.js 24.22.2.

Do not upgrade major runtime versions in the middle of implementation without checking native dependency compatibility and rerunning the full test suite.

### 2.2 Framework and library baseline

| Component | Baseline | Purpose |
|---|---|---|
| React | 19.3.x | Frontend UI |
| Vite | 8.3.x | Frontend development server and production build |
| React Router | 8.5.x | Client-side routing |
| Tailwind CSS | 4.x | UI styling |
| TanStack Query | 5.x | API/server-state management |
| React Hook Form | 7.x | Form state and validation integration |
| Zod | 4.x | Runtime input and structured-output validation |
| Express | 5.x | Backend HTTP server and API routes |
| MongoDB | 8.x | Primary database |
| Mongoose | 9.x | MongoDB ODM |
| Scalar OpenAPI Parser | 0.29.x | OpenAPI parsing and structural validation |
| Ajv | 8.x | JSON Schema validation |
| Ajv Formats | Compatible 3.x release | Supported format validation |
| YAML | Current stable 2.x release | YAML parsing |
| Argon2 | 0.45.x | Argon2id password hashing |

The following versions were observed during the review and serve as reference points, not hardcoded dependency requirements:

- Node.js 24.22.2
- React Router 8.5.1
- Vite 8.3.6
- Mongoose 9.12.x
- Scalar OpenAPI Parser 0.29.19
- Zod 4.6.x
- Argon2 0.45.x

Before installing dependencies:

1. Check current supported versions.
2. Verify Node.js and peer-dependency requirements.
3. Review package maintenance and known vulnerabilities.
4. Check compatibility between React, React Router, Vite, and their plugins.
5. Commit the generated `package-lock.json`.
6. Avoid uncontrolled upgrades during feature development.

Do not use `latest` as a permanent production dependency pin.

## 3. Application architecture

### 3.1 Architecture style

Use a modular monolith.

The frontend and backend are separate application directories within one repository.

The backend runs as a single Express application with separated routes, controllers, services, models, and middleware.

The application does not use microservices, distributed workers, or a separate API gateway.

### 3.2 Repository layout

```text
ContractGuard/
│
├── README.md
├── .gitignore
├── .env.example
├── package-lock.json
│
├── client/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── app/
│       ├── components/
│       ├── features/
│       │   ├── auth/
│       │   ├── projects/
│       │   ├── specifications/
│       │   ├── comparisons/
│       │   ├── tests/
│       │   └── ai/
│       ├── hooks/
│       ├── services/
│       ├── pages/
│       └── main.jsx
│
├── server/
│   ├── package.json
│   └── src/
│       ├── config/
│       ├── models/
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       │   ├── openapi/
│       │   ├── comparison/
│       │   ├── testing/
│       │   └── ai/
│       ├── middleware/
│       ├── validators/
│       ├── fixtures/
│       ├── utils/
│       └── server.js
│
├── docs/
│
└── examples/
```

This is the intended structure, not a requirement to create every directory immediately.

Create feature-specific folders as the corresponding implementation phase begins.

Do not create additional packages, workspace tooling, shared libraries, or abstraction layers without a concrete requirement.

### 3.3 Request and response flow

Development:

```text
React application
       |
       | /api/v1/*
       v
Vite development proxy
       |
       v
Express application
       |
       v
Routes and middleware
       |
       v
Controllers
       |
       v
Application services
       |
       +---------------------+
       |                     |
       v                     v
MongoDB models         Domain logic
                             |
                    +--------+--------+
                    |        |        |
                    v        v        v
                 OpenAPI  Comparison  Test
                  parser    engine    runner
```

Production:

- Express serves the built React application.
- The same Express server handles `/api/v1/*`.
- The browser communicates with the same application origin.
- MongoDB remains the external persistent database.

### 3.4 Module responsibilities

**Frontend**

Responsible for:

- User interaction and visual presentation.
- Form state and client-side validation.
- Routing and navigation.
- API requests.
- Displaying comparison results, coverage and execution evidence.
- Explicit consent before AI-provider submission.
- Loading, empty, error, partial, and success states.

The frontend must never implement authoritative compatibility classifications or authorization decisions.

**Backend**

Responsible for:

- Authentication and authorization.
- Request validation.
- Upload validation and parsing.
- OpenAPI version and schema normalization.
- Deterministic comparison.
- Change-to-operation and change-to-test mapping.
- Test-case approval.
- Regression execution.
- Baseline response validation.
- AI provider interaction and output validation.
- Database persistence.
- Error handling and rate limiting.

The backend is the source of truth.

## 4. Frontend technical requirements

### 4.1 React

Use React 19.3.x with JavaScript and ES modules.

Do not introduce TypeScript.

Use functional components and React hooks.

Component responsibilities should remain focused. Separate reusable UI elements from feature-specific application logic.

### 4.2 Vite

Use Vite 8.x for:

- Local development.
- Hot module replacement.
- Production asset generation.
- Development API proxy configuration.

Development API proxy:

`/api` → local Express server.

The proxy must preserve the request path and relevant cookies.

### 4.3 React Router

Use React Router 8.x in **Declarative Mode**.

Install and import from:

`react-router`

Do not use `react-router-dom` imports for this v8 baseline.

Use the browser router, route components, nested layouts, links, navigation, and route parameters as needed.

Do not use Framework Mode or add server-side rendering.

TanStack Query is responsible for server-state fetching and caching; React Router is responsible for navigation.

### 4.4 Tailwind CSS

Use Tailwind CSS 4.x through the official Vite plugin.

Use:

- `tailwindcss`
- `@tailwindcss/vite`

Follow the Tailwind v4 CSS-first configuration model.

Do not add a legacy Tailwind v3 configuration unless a documented compatibility need arises.

### 4.5 Server-state management

Use TanStack Query 5.x.

It manages:

- Project lists and details.
- Specification versions.
- API operation data.
- Comparison reports.
- Test cases.
- Test-run status and results.
- Account information.

Use query invalidation after successful mutations.

Do not duplicate API/server state unnecessarily in component state.

Avoid Redux Toolkit for v1. Local interface state can use React state and context where genuinely needed.

### 4.6 Forms and validation

Use:

- React Hook Form.
- `@hookform/resolvers`.
- Zod 4.

Responsibilities:

- React Hook Form manages form interaction.
- Zod validates form input.
- The backend independently validates all incoming requests.

Client validation is for usability, not security.

### 4.7 Icons and charts

Use `lucide-react` for icons.

Charts are not required for the initial comparison and execution workflows.

A charting library may be added only when a historical metrics screen has a concrete visualization requirement.

Do not introduce a chart library merely to make the dashboard look more complex.

## 5. Backend technical requirements

### 5.1 Express

Use Express 5.x.

Responsibilities:

- HTTP routing.
- Request parsing.
- Middleware execution.
- Authentication.
- Validation.
- Error handling.
- Static production asset serving.

Use the Express 5 error-handling behavior appropriately.

Keep route handlers focused. Put domain logic in services rather than placing the entire application inside route files.

### 5.2 MongoDB and Mongoose

Use MongoDB 8.x and Mongoose 9.x.

Mongoose handles:

- Schema definitions.
- Model relationships.
- Validation safeguards.
- Query execution.
- Index definitions.
- Timestamps.

Collections:

- `users`
- `projects`
- `specVersions`
- `diffReports`
- `testCases`
- `testRuns`

Refer to `Schema.md` for collection fields, indexes, ownership, historical integrity, and lifecycle rules.

Every child-resource query must be scoped through an authenticated user's project ownership.

### 5.3 Password hashing

Use the `argon2` package and Argon2id.

Requirements:

- Use the approved Argon2id parameters documented in `SecurityReview.md`.
- Use library-generated salts.
- Use asynchronous hashing and verification.
- Store only the resulting encoded hash.
- Do not implement password hashing manually.
- Never log password input or stored hashes.

The password model field is `passwordHash`, but its value is an Argon2id encoded hash.

### 5.4 JWT and cookies

Use `jsonwebtoken` for signing and verifying access tokens.

Use `cookie-parser` to read the authentication cookie.

Cookie name:

`cg_access`

Requirements:

- JWT is stored in an HttpOnly cookie.
- Short, configured access-token lifetime.
- Explicit algorithm allowlist.
- Validate signature, issuer, audience, and expiration.
- No JWT in frontend localStorage or sessionStorage.
- No refresh-token database or rotation infrastructure in v1.
- Logout clears the cookie.
- Unsafe cookie-authenticated requests require origin/CSRF protection.

The lack of immediate server-side token revocation is an acknowledged v1 limitation.

### 5.5 Security middleware

Use maintained packages where appropriate:

- `helmet`
- `express-rate-limit`
- `cookie-parser`
- `multer`

Configure security behavior deliberately.

Do not assume installing middleware automatically provides a complete security solution.

### 5.6 CORS policy

Do not include a CORS dependency by default.

The intended application architecture is same-origin:

- Vite proxies API requests in development.
- Express serves the client build in production.

CORS is not required for that architecture.

If a separate frontend domain is introduced later, reassess the architecture and implement a strict explicit origin allowlist. Do not reflect arbitrary origins.

CSRF protection remains mandatory for cookie-authenticated unsafe methods even when CORS is not enabled.

## 6. OpenAPI ingestion and support policy

### 6.1 Parser

Use:

`@scalar/openapi-parser`

The parser is responsible for document parsing and structural validation.

ContractGuard remains responsible for:

- Supported-feature checks.
- Normalization.
- Compatibility rules.
- Change impact analysis.
- Response-schema validation.

Parser acceptance does not mean that every construct has full ContractGuard support.

### 6.2 Accepted document versions

V1 accepts:

- OpenAPI 3.0.x.
- OpenAPI 3.1.x.
- OpenAPI 3.2.x.

The current published OpenAPI specification at this review is 3.2.1.

Swagger/OpenAPI 2.0 is outside ContractGuard's v1 support policy and must be rejected with a clear unsupported-version message.

The application must inspect the declared version rather than silently converting documents.

### 6.3 Accepted formats

- JSON.
- YAML.

Only the accepted formats are processed.

### 6.4 Resource limits

Initial configurable values:

| Limit | Initial value |
|---|---:|
| Uploaded document size | 1 MiB |
| Maximum path entries | 250 |
| Maximum operations | 500 |
| Maximum document nesting depth | 100 |
| Maximum parsed node count | 50,000 |
| Maximum internal reference resolution depth | 20 |
| Maximum changes stored per comparison | 5,000 |
| Maximum source/schema storage document size | 8 MiB |
| Maximum approved test cases per run | 20 |
| Maximum active test runs | 2 |
| Maximum concurrent test executions per run | 2 |
| Per-test timeout | 5 seconds |
| Total run deadline | 60 seconds |

These are defensive starting limits, not performance guarantees.

Keep them in centralized server configuration.

Return a typed error or partial-analysis outcome when a limit is exceeded. Do not silently truncate analysis and mark it complete.

### 6.5 Upload handling

Use Multer with memory storage for the bounded upload size.

Requirements:

- Reject oversized files before parsing.
- Validate accepted formats.
- Do not trust browser-provided MIME types or filenames.
- Parse JSON and YAML using safe parser configuration.
- Validate duplicate YAML mapping keys.
- Reject unsupported custom YAML tags.
- Reject YAML aliases in v1 before alias expansion.
- Apply parser and post-parse depth/node limits.
- Compute SHA-256 from the original uploaded bytes.
- Never derive a filesystem path from a user-supplied filename.
- Do not execute uploaded content.
- Store only bounded original and derived representations.

Uploaded specification versions remain immutable.

### 6.6 Reference handling

Support internal document references within the implemented subset.

Requirements:

- Local JSON Pointer references only.
- No HTTP/HTTPS external `$ref` fetching.
- No external relative-file resolution.
- Detect cycles.
- Enforce a maximum resolution depth.
- Preserve unresolved-reference diagnostics.
- Avoid unbounded dereferencing or document expansion.
- Mark relevant unsupported references as unsupported analysis.

The parser must never contact a server or resource declared by the uploaded document.

### 6.7 Parser and normalization responsibilities

The ingestion pipeline is:

1. Receive bounded upload.
2. Detect accepted format.
3. Parse document.
4. Validate declared OpenAPI version.
5. Validate OpenAPI structure.
6. Inspect unsupported constructs.
7. Apply reference safety checks.
8. Normalize supported constructs.
9. Extract operations and schemas.
10. Compute and persist the immutable specification version.

The original source document must never be rewritten during normalization.

## 7. JSON Schema and response-validation strategy

### 7.1 Core problem

OpenAPI 3.0 Schema Objects are not identical to standard JSON Schema 2020-12.

OpenAPI 3.1 and 3.2 use JSON Schema-based dialects and OpenAPI vocabulary behavior. The declared dialect may affect which keywords can be interpreted.

Consequently, ContractGuard must not pass arbitrary extracted OpenAPI schemas directly to Ajv and claim complete validation.

### 7.2 Ajv

Use:

- `ajv`
- `ajv-formats`

Use the appropriate Ajv 2020-12 implementation for supported JSON Schema 2020-12 validation.

Do not attempt to combine incompatible JSON Schema dialects in one Ajv instance.

### 7.3 Version-aware normalization adapter

Create a dedicated version-aware normalization layer.

Its responsibilities:

1. Identify the OpenAPI version.
2. Identify the applicable schema dialect.
3. Recognize the supported OpenAPI-specific vocabulary behavior.
4. Convert supported constructs into the internal validation representation.
5. Preserve the original schema separately.
6. Reject or mark unsupported constructs instead of silently dropping meaningful validation behavior.
7. Produce a diagnostic linked to the source JSON Pointer.

OpenAPI 3.0 handling must explicitly account for `nullable` semantics and other differences from newer JSON Schema dialects.

For OpenAPI 3.1/3.2, unsupported custom dialects or vocabulary extensions must produce an unsupported/partial result.

### 7.4 Initial supported response-validation subset

The initial supported validation subset includes:

- `type`
- `properties`
- `required`
- `items`
- `enum`
- `const`
- `minimum`
- `maximum`
- `exclusiveMinimum`
- `exclusiveMaximum`
- `minLength`
- `maxLength`
- `pattern`
- `minItems`
- `maxItems`
- `uniqueItems`
- Explicitly supported `format` values
- Supported internal `$ref`
- OpenAPI 3.0 `nullable` after correct normalization
- Supported additional-properties behavior

The exact implementation subset must be verified with tests for every supported OpenAPI version.

### 7.5 Unsupported validation constructs

The following require explicit implementation and fixtures before being treated as supported:

- `allOf`
- `oneOf`
- `anyOf`
- `not`
- Complex discriminator-based polymorphism.
- Recursive/cyclic schema graphs.
- Dynamic references.
- Custom JSON Schema vocabularies.
- Custom schema dialects.
- Complex conditional schemas.
- Unsupported serialization constructs.

When these affect a relevant operation:

- Do not silently remove the construct.
- Do not claim a complete validation result.
- Record a useful source-location diagnostic.
- Mark the relevant comparison or execution outcome partial/unsupported.

### 7.6 Response-validation direction

The candidate implementation provides the response.

The baseline schema defines what an existing consumer expects.

Therefore:

**Validate the candidate response against the baseline response schema.**

Validating only against the candidate schema would not establish backward compatibility.

## 8. Compatibility analysis engine

### 8.1 Implementation

Implement the compatibility engine as a deterministic JavaScript domain module.

It must not be dependent on the UI, database, AI provider, or network calls.

Inputs:

- Normalized baseline specification.
- Normalized candidate specification.
- Supported ruleset version.

Outputs:

- Stable change records.
- Rule IDs.
- Classifications.
- Source locations/JSON Pointers.
- Affected operation keys.
- Human-readable rationale.
- Classification summary counts.
- Overall analysis status.
- Unsupported-feature warnings.

### 8.2 Ruleset

Initial ruleset:

`CG-COMPAT-1.1`

Comparison direction:

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

Classifications:

- `BREAKING`
- `POTENTIALLY_BREAKING`
- `NON_BREAKING`
- `INFORMATIONAL`
- `UNSUPPORTED`

Overall status:

- `COMPLETE`
- `PARTIAL`
- `FAILED`

The complete rule catalog is defined in `Rules.md`.

### 8.3 Determinism

For the same normalized baseline, candidate, and ruleset:

- Same operations must be matched.
- Same changes must be detected.
- Same rule IDs must be assigned.
- Same classifications must be produced.
- Same change IDs must be generated.
- Findings must be sorted consistently.

Do not include random IDs or timestamps in the compatibility decision logic.

Persist the ruleset identifier with every report.

### 8.4 Path matching

Use canonical HTTP path shapes for operation matching.

Example:

- Baseline: `/users/{id}`
- Candidate: `/users/{userId}`

Canonical operation matching must identify these as the same structural path and method before comparing the original parameter names.

Preserve original paths and parameter names for reporting and display.

### 8.5 Shared schema impact

The comparison engine must track supported internal schema references.

When a shared component changes:

1. Identify its source JSON Pointer.
2. Find operations that reference the affected component.
3. Determine direct and indirect operation impact within supported reference boundaries.
4. Record all affected canonical operation keys.
5. Link those keys to the baseline test-case library.
6. Mark unresolved relationships or unsupported reference behavior as partial.

The engine must not claim exhaustive impact analysis when references cannot be fully evaluated.

## 9. Change-to-test traceability

This is a P0 product capability.

Each change has:

- A stable `changeId`.
- A rule ID.
- A source JSON Pointer.
- A canonical operation key where relevant.
- One or more affected operation keys where supported.
- A classification and rationale.

Test cases are linked to operations in the baseline specification.

Coverage is derived by matching the affected operation keys to test cases belonging to the comparison's baseline specification version.

Coverage states:

- `COVERED`
- `DRAFT_ONLY`
- `UNCOVERED`

Coverage means test-case availability, not successful test execution.

Actual regression evidence is stored separately in `testRuns`.

The frontend must distinguish:

- No linked test case.
- Draft-only coverage.
- Approved test coverage.
- Passed regression.
- Failed regression.
- Partial/unsupported regression.

## 10. Regression runner design

### 10.1 Scope

V1 executes approved baseline test cases against the bundled candidate Demo Store implementation.

The runner is not a general-purpose API client or proxy.

Only approved GET operations are supported.

### 10.2 Execution architecture

Use a server-controlled in-process Demo Store adapter.

The adapter dispatches approved operations to known bundled candidate handlers using:

- Recognized fixture identifier.
- Canonical operation key.
- Validated path parameters.
- Validated query parameters.

It returns a bounded response envelope containing:

- HTTP status.
- Response headers required for validation.
- Response body.
- Execution duration.

The runner validates this response against the baseline contract and approved assertions.

This design avoids arbitrary network targets, external outbound requests, redirect handling, and user-controlled hostnames.

It also means v1 tests the bundled demonstration implementation rather than arbitrary deployed production servers. The UI and README must describe this limitation accurately.

### 10.3 Execution target

The server chooses the execution target from a known fixture registry.

Allowed execution profile:

`BUNDLED_DEMO_STORE`

Fixture examples:

- `DEMO_STORE_V1`
- `DEMO_STORE_V2`

The candidate version must be recognized as a supported bundled fixture before it can be executed.

An arbitrary user-uploaded specification does not become runnable merely because it declares a `servers` URL or resembles the demonstration fixture.

### 10.4 Request construction

- The operation is obtained from the baseline specification.
- The selected test case supplies bounded path and query values.
- The runner constructs the operation input through the supported parameter definitions.
- No arbitrary target URL is accepted.
- No arbitrary host, IP address, network port, proxy, or redirect destination is accepted.
- No arbitrary headers or credentials are accepted.
- No user-supplied executable test code is accepted.
- Only approved GET operations execute.

### 10.5 Response validation

The execution flow is:

1. Load the comparison.
2. Load the exact baseline and candidate versions.
3. Validate selected test cases belong to the baseline version.
4. Validate approval status.
5. Resolve the candidate's bundled implementation profile.
6. Invoke the candidate implementation handler.
7. Capture the response envelope.
8. Validate status and supported response metadata.
9. Validate the response body against the baseline response schema.
10. Evaluate explicit test assertions.
11. Store bounded and sanitized evidence.
12. Finalize the result and run status.

The candidate response schema is not used as a substitute for the baseline response schema.

### 10.6 Execution limits

| Limit | Initial value |
|---|---:|
| Approved test cases per run | 20 |
| Concurrent runs | 2 |
| Concurrent tests per run | 2 |
| Per-test timeout | 5 seconds |
| Total run deadline | 60 seconds |
| Maximum response body | 256 KiB |
| Maximum stored evidence per result | 16 KiB |
| Maximum validation diagnostics per result | 50 |

Limits are enforced by the backend.

A timeout or unsupported operation cannot produce a passing result.

### 10.7 Run lifecycle

Allowed statuses:

- `QUEUED`
- `RUNNING`
- `PASSED`
- `FAILED`
- `PARTIAL`
- `INTERRUPTED`

There is no `CANCELLED` state in v1.

A bounded in-process execution queue is sufficient for the initial release.

If the Node process restarts while a run is queued or running, the application must identify that run and mark it `INTERRUPTED` during startup recovery.

Do not claim durable background processing, distributed execution, or horizontal scaling.

## 11. AI integration

### 11.1 Provider

Use Google's official JavaScript SDK:

`@google/genai`

Use the Gemini Developer API only when a usable unpaid model and quota are available to the project at implementation time.

The provider and model must be configurable through backend environment variables.

Do not hardcode a model identifier throughout the application.

### 11.2 Optional installation

Install the AI SDK only when the AI implementation phase begins.

The application must start and its core features must work when the SDK or API key is unavailable.

### 11.3 Free-tier policy

The unpaid Gemini API tier currently allows limited free model access but states that submitted content may be used to improve Google products and services. Quotas, model access, and terms can change.

Therefore:

- Only bundled synthetic Demo Store context may be submitted.
- Arbitrary user-uploaded specifications must not be submitted.
- Private production API contracts must not be submitted.
- Production request/response data and credentials must never be submitted.
- No paid provider fallback is permitted.
- The user must explicitly consent after seeing the bounded context to be shared.

Recheck current pricing, model access, privacy terms, and quotas when implementing this phase.

### 11.4 Output contract

The model must return a constrained structured object.

Possible fields:

- `title`
- `rationale`
- `operationKey`
- `testCategory`
- `inputSuggestion`
- `expectedAssertion`
- `riskLevel`

The output is parsed and validated with Zod.

Unknown fields, malformed results, executable code, arbitrary URLs, and unsupported operations are rejected.

Every accepted suggestion begins as a draft test case.

AI cannot:

- Decide compatibility classification.
- Decide pass/fail.
- Approve a test case.
- Select a runner target.
- Execute code.
- Access tools or application databases.

## 12. Backend dependency set

Install dependencies according to implementation needs.

### 12.1 Core

- `express`
- `mongoose`
- `argon2`
- `jsonwebtoken`
- `cookie-parser`
- `helmet`
- `express-rate-limit`
- `multer`
- `zod`
- `yaml`
- `@scalar/openapi-parser`
- `ajv`
- `ajv-formats`
- `dotenv` when environment loading is not provided by the runtime invocation

Do not add `cors` for the intended same-origin architecture.

### 12.2 Optional AI

Install only during the AI phase:

- `@google/genai`

### 12.3 Dependency-selection rules

- Use maintained stable releases.
- Keep exact resolved versions in `package-lock.json`.
- Avoid duplicate validation libraries.
- Avoid packages that duplicate existing functionality.
- Review native module installation requirements on Windows and the deployment environment.
- Reassess known vulnerabilities before public release.
- Do not add a package merely because an alternative project uses it.

## 13. Frontend dependency set

### 13.1 Core

- `react`
- `react-dom`
- `vite`
- `@vitejs/plugin-react`
- `react-router`
- `tailwindcss`
- `@tailwindcss/vite`
- `@tanstack/react-query`
- `react-hook-form`
- `@hookform/resolvers`
- `zod`
- `lucide-react`

Do not install:

- `react-router-dom` for the React Router 8 baseline.
- Redux Toolkit.
- A charting package before a real chart requirement exists.
- An API client SDK for the ContractGuard backend when ordinary fetch requests are sufficient.

## 14. Testing and code-quality requirements

### 14.1 Unit tests

Use Vitest.

Required areas:

- Path normalization.
- Operation matching.
- Schema normalization.
- Compatibility rules.
- Stable change identifiers.
- Change ordering.
- Shared-reference impact analysis.
- Coverage derivation.
- Request construction.
- Response-schema validation.
- AI output validation.

Each compatibility rule must have fixture-based tests.

### 14.2 Backend integration tests

Use Supertest for Express API tests.

Required areas:

- Registration and authentication.
- Authorization and ownership.
- Upload validation.
- Specification parsing.
- Comparison creation.
- Test-case lifecycle.
- Test-run creation and result persistence.
- CSRF/origin enforcement.
- AI consent and restrictions.

Use a dedicated test database.

`mongodb-memory-server` may be considered only if its binary download and Windows environment are reliable. It is not a required infrastructure dependency.

Do not make Docker a prerequisite for testing.

### 14.3 Frontend E2E tests

Use Playwright.

Cover the primary flows:

1. Register/login.
2. Create a project.
3. Upload a specification.
4. Explore operations.
5. Compare two versions.
6. Inspect changes and coverage.
7. Create and approve a test case.
8. Execute an eligible test run.
9. Review results and evidence.
10. Use AI suggestion flow when configured, or verify its disabled state.

### 14.4 Code quality

Use ESLint with a suitable JavaScript configuration.

Formatting should be consistent across the client and server.

Test and build commands must be documented.

Do not introduce complex linting, architecture enforcement, or custom build tooling without a concrete benefit.

## 15. Application configuration and environments

### 15.1 Required backend configuration

- `NODE_ENV`
- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `APP_ORIGIN`

### 15.2 Optional backend configuration

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

Other limits may be configured centrally with documented defaults.

The actual `.env.example` must include safe placeholder values only.

Never place secrets in frontend `VITE_` variables.

### 15.3 Environments

**Development**

- Local Node.js server.
- Vite development server.
- Local MongoDB or Atlas Free database.
- Optional AI disabled unless deliberately configured.

**Test**

- Dedicated test database.
- Deterministic fixtures.
- No production credentials or real customer data.
- No external runner targets.

**Production/demo**

- HTTPS.
- Environment-provided secrets.
- Same-origin React and Express.
- External MongoDB connection.
- No durable local specification-file storage requirement.
- Optional AI restricted to synthetic fixtures.

## 16. Deployment and zero-cost constraints

### 16.1 Local development

The complete core application must run without a paid service.

Local MongoDB is suitable for development. An Atlas Free cluster is an optional alternative.

AI is not required for local development or core functionality.

### 16.2 Optional public demonstration

Potential services:

- Render Free for the combined Express application and built React assets.
- MongoDB Atlas Free for persistent application records.
- Gemini Developer API free tier for optional synthetic-fixture suggestions.
- GitHub Actions for repository CI.

### 16.3 Known limitations

Render Free web services:

- Spin down after 15 minutes without inbound traffic.
- May take approximately one minute to restart.
- Have an ephemeral filesystem.
- Do not provide persistent disks on the free compute plan.
- May restart independently.

MongoDB Atlas Free clusters:

- Use MongoDB 8.0.
- Have a 0.5 GB total storage limit.
- Have throughput and operational limitations.
- May pause after 30 days of inactivity with no connections.

The application must therefore:

- Persist application data in MongoDB.
- Never rely on local filesystem storage for durable user data.
- Keep upload processing bounded and memory-based.
- Avoid unnecessary document duplication.
- Apply application-level storage and resource limits.
- Clearly disclose cold-start behavior on the public demo.
- Keep local development as the reliable demonstration path.

Free services are suitable for a portfolio demonstration, not a production availability guarantee.

## 17. Explicit technology exclusions

The following technologies are excluded from the v1 baseline:

| Technology | Reason |
|---|---|
| TypeScript | JavaScript-only project constraint |
| Redis | No distributed queue or caching requirement |
| BullMQ | In-process bounded runner is sufficient |
| Kafka | No event-streaming requirement |
| Docker | Not required for initial local development |
| Kubernetes | No container orchestration requirement |
| Microservices | Modular monolith is sufficient |
| RAG/vector database | No retrieval system required |
| AI agents | AI suggestions are a bounded request/response feature |
| OpenTelemetry | No observability platform required |
| Socket.IO | Polling is adequate for bounded test-run status |
| Pact | Not required for the custom OpenAPI comparison workflow |
| External API proxy | Explicitly outside the security boundary |
| GitHub App integration | Deferred beyond v1 |

An excluded technology may be reconsidered only when a concrete product requirement justifies it and the security, maintenance, and learning costs are understood.

## 18. Technical acceptance criteria

The technical baseline is accepted when:

1. Client and server run as separate development applications in one repository.
2. Production uses one same-origin Express application.
3. React Router 8 is used in Declarative Mode.
4. Tailwind CSS 4 is configured through Vite.
5. TanStack Query manages API/server state.
6. Express 5 handles backend routing and errors.
7. MongoDB and Mongoose implement the documented six collections.
8. Passwords are stored using Argon2id.
9. JWT authentication is carried in an HttpOnly cookie.
10. Unsafe cookie-authenticated requests have origin/CSRF protection.
11. JSON and YAML OpenAPI documents are parsed with bounded, safe processing.
12. OpenAPI versions 3.0, 3.1, and 3.2 have explicit support boundaries.
13. The JSON Schema adapter handles version-specific semantics.
14. Unsupported schema behavior produces partial/unsupported results.
15. The compatibility engine is deterministic and fixture-tested.
16. Shared schema impact is connected to affected operations and baseline test cases.
17. The runner executes only approved GET cases against the bundled candidate adapter.
18. Candidate responses are validated against baseline response schemas.
19. Test-run limits and interruption handling are enforced.
20. AI is optional, consent-gated, restricted to synthetic fixtures, and schema-validated.
21. The full core application works without an AI provider key.
22. Unit, integration, and primary E2E tests are automated.
23. No Docker, Redis, microservices, or paid services are prerequisites.
24. Clean-checkout installation and run instructions work.

## 19. Official technical references

Verify these sources again when implementing the corresponding component. Package versions, supported features, and provider policies can change.

### Runtime and framework

- Node.js release schedule:  
  https://github.com/nodejs/Release/blob/main/README.md

- React 19.3 release:  
  https://react.dev/blog/2026/09/09/react-19-3

- Vite documentation:  
  https://vite.dev/guide/

- Vite releases:  
  https://github.com/vitejs/vite/releases

- React Router modes:  
  https://reactrouter.com/start/modes

- React Router v8 migration:  
  https://reactrouter.com/upgrading/v7

- Tailwind CSS with Vite:  
  https://tailwindcss.com/docs/installation/using-vite

- TanStack Query React documentation:  
  https://tanstack.com/query/latest/docs/framework/react

### Backend and data

- Express 5 API:  
  https://expressjs.com/en/api/

- Mongoose compatibility:  
  https://mongoosejs.com/docs/compatibility.html

- Argon2 package:  
  https://www.npmjs.com/package/argon2

- OWASP Password Storage Cheat Sheet:  
  https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

### OpenAPI and validation

- OpenAPI Specification 3.2.1:  
  https://spec.openapis.org/oas/v3.2.1.html

- Scalar OpenAPI Parser:  
  https://github.com/scalar/scalar/tree/main/packages/openapi-parser

- Ajv JSON Schema documentation:  
  https://ajv.js.org/json-schema.html

- YAML package:  
  https://eemeli.org/yaml/

### AI and deployment

- Google Gen AI JavaScript SDK:  
  https://googleapis.github.io/js-genai/

- Gemini API pricing and free-tier policy:  
  https://ai.google.dev/gemini-api/docs/pricing

- Gemini API terms:  
  https://ai.google.dev/gemini-api/terms

- MongoDB Atlas Free cluster limitations:  
  https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/

- Render Free service limitations:  
  https://render.com/docs/free
