
# ContractGuard

**API Compatibility, Change-Impact Analysis & Regression Testing Workbench**

ContractGuard is a developer-focused application that helps engineers understand, evaluate, and trace the impact of API contract changes before they cause downstream regressions.

It allows developers to upload versioned OpenAPI specifications, explore API operations, compare baseline and candidate contracts, identify potentially breaking changes, map changes to affected operations, and connect those changes to relevant regression test cases.

The project focuses on making API compatibility analysis explainable, deterministic, and actionable through an integrated developer workbench.

---

## 1. Project Overview

API providers frequently evolve their contracts by changing endpoints, parameters, request schemas, response structures, and shared components.

Even seemingly minor changes can break existing consumers, including frontend applications, SDKs, and dependent services.

Manually comparing large OpenAPI documents is time-consuming and error-prone. Basic endpoint availability checks also cannot establish whether a new API response remains compatible with the contract expected by existing consumers.

ContractGuard addresses this problem through a structured workflow:

1. Import and validate OpenAPI specifications.
2. Maintain immutable specification versions.
3. Explore API paths, operations, parameters, and schemas.
4. Compare a baseline specification with a candidate specification.
5. Detect and classify contract changes using deterministic compatibility rules.
6. Identify operations affected by direct and supported shared-schema changes.
7. Connect compatibility findings to baseline test cases.
8. Review available test coverage and identify gaps.
9. Build regression evidence through controlled test execution.
10. Maintain historical comparison and testing records.

**Core principle: Every API change should be understandable, traceable, and testable.**

---

## 2. Key Features

### 2.1 Specification Management

- Upload OpenAPI specifications in JSON and YAML formats.
- Support OpenAPI 3.0.x, 3.1.x, and 3.2.x within an explicitly documented feature subset.
- Preserve immutable specification versions.
- Calculate SHA-256 hashes from original uploaded content.
- Detect duplicate specification uploads within a project.
- Validate specification structure and identify unsupported constructs.
- Maintain specification version history.

### 2.2 API Explorer

- Browse API paths and HTTP methods.
- Inspect operation descriptions and metadata.
- Explore effective parameters.
- Inspect supported request-body definitions.
- Inspect response definitions and schemas.
- Navigate supported internal schema references.
- Display source JSON Pointers and reference diagnostics.
- Identify unsupported specification constructs.

### 2.3 Compatibility Analysis Engine

- Perform directional baseline-to-candidate comparisons.
- Match corresponding API operations.
- Detect changes to paths, operations, parameters, requests, responses, and schemas.
- Evaluate compatibility using deterministic rules.
- Generate stable change identifiers.
- Provide rule IDs, source locations, classifications, and explanations.
- Calculate classification summaries.
- Report incomplete analysis when relevant constructs are unsupported.

The current ruleset is:

`CG-COMPAT-1.1`

Supported finding classifications:

| Classification | Meaning |
|---|---|
| `BREAKING` | The candidate can violate existing consumer expectations. |
| `POTENTIALLY_BREAKING` | The change may cause incompatibility depending on usage or semantics. |
| `NON_BREAKING` | The supported analysis establishes compatibility under the documented assumptions. |
| `INFORMATIONAL` | The change is relevant but does not establish a compatibility break. |
| `UNSUPPORTED` | The change cannot be reliably evaluated by the implemented ruleset. |

Overall analysis statuses:

- `COMPLETE`
- `PARTIAL`
- `FAILED`

### 2.4 Change-Impact Analysis

- Identify directly affected API operations.
- Identify supported indirect dependencies through shared schema references.
- Preserve canonical operation keys.
- Maintain source JSON Pointer information.
- Propagate unresolved, circular, external, or bounded-reference warnings.
- Avoid treating an incomplete impact graph as exhaustive.

The current reference-impact implementation uses conservative operation-scope reference closure. It can over-approximate impact when several unrelated schemas are referenced within the same operation scope. It is not pointer-exact attribution.

### 2.5 Change-to-Test Traceability

- Associate test cases with a specific baseline specification version.
- Link compatibility findings to affected baseline operations.
- Retrieve linked test cases using canonical operation keys.
- Distinguish draft, approved, and archived test cases.
- Derive change-coverage projections from the current test-case library.
- Identify operations without suitable test coverage.

Coverage statuses:

| Status | Meaning |
|---|---|
| `COVERED` | Every affected baseline operation has at least one approved test case. |
| `DRAFT_ONLY` | Every affected operation has a linked case, but at least one is covered only by drafts. |
| `UNCOVERED` | At least one affected operation has no linked draft or approved case. |
| `UNMAPPED` | No affected operation key is available. |

Archived cases are excluded from coverage.

A coverage status indicates the availability of test cases, not successful test execution.

### 2.6 Test-Case Management

The Phase 6 implementation introduces:

- Baseline-version-specific test cases.
- Canonical operation-key association.
- Manually authored test cases.
- Bounded path and query parameter inputs.
- Structured response assertions.
- Draft, approved, and archived lifecycle states.
- Authenticated test-case APIs.
- Test-case library and editor interfaces.
- Comparison-level coverage visibility.

The current manual case scope is restricted to GET path operations. Required path and query parameters are validated against the selected baseline operation.

### 2.7 Regression Execution — Planned Next Phase

The intended regression runner will execute approved baseline test cases against a server-controlled bundled candidate implementation.

Its intended responsibilities include:

- Trusted Demo Store fixture recognition.
- Bounded GET-operation execution.
- Candidate response validation against baseline response schemas.
- Explicit assertion evaluation.
- Execution result persistence.
- Historical test-run evidence.

**The regression runner is not yet implemented.**

Arbitrary external API execution is intentionally excluded from the v1 security boundary.

### 2.8 AI-Assisted Test Suggestions — Planned Enhancement

An optional AI integration is planned to generate structured test suggestions for eligible synthetic demonstration fixtures.

The intended design requires:

- Explicit user consent.
- Bounded synthetic context.
- Backend-controlled provider communication.
- Structured output validation.
- Human review and approval.
- No autonomous execution of AI-generated code.

AI will not determine compatibility classifications or regression pass/fail results.

**The AI integration is not yet implemented.**

---

## 3. Compatibility Direction

ContractGuard uses the following comparison direction:

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

The baseline represents the contract existing consumers expect.

The candidate represents the contract proposed by the updated provider.

The analysis evaluates two fundamental requirements:

**Request compatibility:** The candidate provider must continue accepting requests valid under the baseline contract.

**Response compatibility:** The candidate provider must continue producing responses that existing baseline consumers can process.

During regression execution, candidate responses must be validated against the baseline response schemas.

The compatibility engine is deterministic. AI is not involved in classification decisions.

---

## 4. Technology Stack

The project uses JavaScript throughout its frontend and backend.

| Layer | Technology |
|---|---|
| Runtime | Node.js 24.x |
| Language | JavaScript (ES Modules) |
| Frontend | React 19.x |
| Build Tool | Vite 8.x |
| Routing | React Router 8.x |
| Styling | Tailwind CSS 4.x |
| Server State | TanStack Query 5.x |
| Forms | React Hook Form 7.x |
| Form Validation | Zod 4.x |
| Backend | Express 5.x |
| Database | MongoDB |
| ODM | Mongoose 9.x |
| Authentication | JWT |
| Password Hashing | bcrypt 6.x |
| API Security | Helmet, Express Rate Limit, Cookie Parser |
| File Uploads | Multer |
| OpenAPI Parsing | @scalar/openapi-parser |
| Schema Validation | Ajv 8.x |
| Schema Formats | ajv-formats |
| YAML Parsing | yaml |
| Unit Testing | Vitest |
| API Integration Testing | Supertest |
| Icons | Lucide React |

The project uses the dependency versions recorded in its respective package manifests and lockfiles.

No TypeScript, Redux Toolkit, Redis, Kafka, Docker, Kubernetes, or microservices are required by the current architecture.

---

## 5. Architecture

ContractGuard follows a modular monolithic architecture.

The React application communicates with an Express backend, which coordinates authentication, specification processing, compatibility analysis, traceability, and persistence through dedicated application services.

MongoDB stores application records and historical evidence.

### High-level architecture

```text
                 USER
                  |
                  v
           React Application
           React Router
           TanStack Query
                  |
                  v
              Express API
                  |
           Security Middleware
                  |
                  v
                Routes
                  |
                  v
              Controllers
                  |
                  v
            Application Services
                  |
       +-----------+-----------+
       |           |           |
       v           v           v
   OpenAPI     Compatibility  Traceability
   Processing  Engine         Service
       |           |           |
       +-----------+-----------+
                  |
                  v
               Mongoose
                  |
                  v
                MongoDB
```

### Main backend responsibilities

- Authentication and authorization.
- Project ownership.
- OpenAPI ingestion and normalization.
- Compatibility analysis.
- Reverse-reference impact mapping.
- Test-case lifecycle management.
- Change-to-test coverage.
- Historical comparison persistence.

### Main frontend responsibilities

- Authentication screens.
- Project workspace.
- Specification management.
- API Explorer.
- Comparison workspace.
- Change-impact visibility.
- Test-case library and editor.
- Test-coverage projection.

The backend remains the authority for validation, authorization, compatibility classifications, and resource lifecycle transitions.

---

## 6. Repository Structure

```text
ContractGuard/
│
├── README.md
├── .env.example
├── .gitignore
├── MANIFEST.json
│
├── client/
│   ├── package.json
│   ├── package-lock.json
│   └── src/
│       ├── components/
│       ├── features/
│       │   ├── auth/
│       │   ├── projects/
│       │   ├── specifications/
│       │   └── comparisons/
│       ├── pages/
│       ├── hooks/
│       ├── lib/
│       ├── App.jsx
│       └── main.jsx
│
├── server/
│   ├── package.json
│   ├── package-lock.json
│   └── src/
│       ├── config/
│       ├── models/
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── validators/
│       ├── middleware/
│       ├── utils/
│       ├── app.js
│       └── server.js
│
├── docs/
│   ├── PRD.md
│   ├── Design.md
│   ├── TRD.md
│   ├── Architecture.md
│   ├── AppFlow.md
│   ├── Schema.md
│   ├── API.md
│   ├── Rules.md
│   ├── SecurityReview.md
│   └── ImplementationPlan.md
│
└── examples/
    ├── README.md
    ├── demo-store-v1.yaml
    └── demo-store-v2.yaml
```

The exact feature subdirectories may evolve as implementation progresses.

---

## 7. Getting Started

### Prerequisites

Install the following:

- Node.js 24.x.
- npm compatible with the installed Node.js version.
- MongoDB 8.x or a compatible MongoDB deployment.
- Git.
- Visual Studio Code or another JavaScript editor.

### 7.1 Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd ContractGuard
```

Replace the repository placeholder with the actual repository URL.

### 7.2 Install backend dependencies

```bash
cd server
npm install
```

### 7.3 Install frontend dependencies

Open another terminal in the project root:

```bash
cd client
npm install
```

The committed lockfiles should be used to reproduce the project's resolved dependency versions. For a clean CI installation, use `npm ci` in each application directory.

### 7.4 Configure environment variables

Create a root-level `.env` file by copying `.env.example`.

```env
# Application
NODE_ENV=development
PORT=5000
APP_ORIGIN=http://localhost:5173

# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/contractguard

# Separate integration-test database
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/contractguard_test

# Authentication
JWT_SECRET=YOUR_64_CHARACTER_BASE64URL_SECRET
JWT_EXPIRES_IN=30m

# Optional future AI configuration
GEMINI_API_KEY=
GEMINI_MODEL=
```

Generate a suitable JWT secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Paste the generated value into `JWT_SECRET`.

The secret must decode to exactly 48 bytes.

Ensure MongoDB is running and the configured database is accessible.

Never commit the actual `.env` file.

### 7.5 Start the backend

From the project root:

```bash
cd server
npm start
```

The backend starts at:

`http://localhost:5000`

### 7.6 Start the frontend

Open a second terminal:

```bash
cd client
npm run dev
```

Vite starts the frontend development server, normally at:

`http://localhost:5173`

The Vite configuration proxies `/api` requests to the Express backend at `http://localhost:5000`.

Open the frontend URL in your browser.

---

## 8. Testing and Validation

### Backend tests

From the `server` directory:

```bash
npm test
```

The backend uses Vitest and Supertest.

Integration tests that require MongoDB must use the separate `MONGODB_TEST_URI` database.

Do not point destructive integration tests at a development or production database.

### Frontend linting

From the `client` directory:

```bash
npm run lint
```

### Frontend production build

```bash
npm run build
```

### Production preview

```bash
npm run preview
```

The frontend package currently provides `dev`, `build`, `lint`, and `preview` scripts. It does not define a separate frontend `npm test` script.

---

## 9. Security Considerations

Security is a fundamental design constraint.

The application incorporates the following principles:

- JWT authentication through an HttpOnly cookie.
- Password hashing using bcrypt.
- Server-side project and resource ownership checks.
- Request validation using Zod.
- Configured request-origin protection for cookie-authenticated state-changing operations.
- Security headers through Helmet.
- Rate limiting for protected and sensitive operations.
- Bounded multipart uploads.
- Safe YAML parsing.
- Controlled internal-reference resolution.
- Explicit unsupported-feature diagnostics.
- Immutable specification and comparison history.
- Server-controlled resource and execution boundaries.

Uploaded OpenAPI documents are untrusted input.

External `$ref` resources and arbitrary OpenAPI server URLs must never be fetched or executed.

The planned regression runner is restricted to a trusted bundled implementation and approved test cases.

Optional AI integrations must remain isolated from authentication credentials, production data, and confidential user-uploaded specifications.

---

## 10. Current Development Status

**Last updated:** 11 November 2026

ContractGuard is under active development.

| Phase | Area | Current status |
|---|---|---|
| Phase 0 | Product and technical documentation | Baseline established; consistency review ongoing |
| Phase 1 | Repository and application foundation | Implemented; final acceptance review pending |
| Phase 2 | Authentication and project management | Core implementation present; complete acceptance review pending |
| Phase 3 | OpenAPI ingestion and normalization | Core implementation present; acceptance review pending |
| Phase 4 | API Explorer | Core workflows implemented and browser-verified; remaining checks pending |
| Phase 5 | Compatibility analysis engine | Core implemented and integrated; paired analyzer-fixture verification remains outstanding |
| Phase 6 | Change-to-test traceability | Implemented, automated tests passed, frontend checks passed, and browser acceptance verified |
| Phase 7 | Bounded regression runner | Not implemented |
| Phase 8 | Optional AI test suggestions | Not implemented |
| Phase 9 | Complete frontend workflows | In progress |
| Phase 10 | Security and performance review | Pending |
| Phase 11 | CI and deployment | Pending |

### Phase 5 verification record

The latest complete backend verification, performed on 11 November 2026, reported:

- **40 test files passed.**
- **442 tests passed.**

This run includes the backend test suite following the report-contract, operation-matching, and Phase 6 implementation changes.

The mapping and finding-contract fixtures cover all 52 documented compatibility rule IDs.

Paired baseline/candidate analyzer fixtures for every applicable rule remain an outstanding verification requirement. Passing the complete automated suite does not, by itself, establish that every possible rule has exhaustive paired analyzer-fixture coverage.

### Phase 6 implementation scope

The Phase 6 implementation introduces:

- Reverse-reference impact analysis.
- Affected-operation mapping.
- TestCase persistence.
- Test-case validation.
- Test-case APIs and lifecycle.
- Baseline-version association.
- Live change-to-test coverage projections.
- Test-case library and editor.
- Comparison coverage interface.

The implementation includes focused automated tests and service-level validation.

### Phase 6 verification record

Phase 6 local verification was completed on 11 November 2026.

**Backend**

- 40 test files passed.
- 442 tests passed.
- The full backend test suite completed successfully after the Phase 6 implementation and subsequent model-limit alignment.

**Frontend**

- ESLint completed successfully.
- Vite production build completed successfully.

**Browser acceptance**

- Authentication and project access were verified.
- The comparison workspace was opened and its compatibility findings were inspected.
- Manual test cases were created for baseline API operations.
- Test cases were approved through the test-case lifecycle.
- The comparison coverage view reflected the approved test cases.
- The verified sample comparison showed 7 covered findings, 0 draft-only findings, 0 uncovered findings, and 0 unmapped findings.

The test-case library showed 2 approved cases, 0 drafts, and 0 archived cases during the acceptance check.

**Phase 6 is accepted for its implemented change-impact, test-case management, and coverage-projection scope.**

This acceptance does not mean that regression execution has been implemented. Coverage represents the availability of approved test cases, not successful execution against a candidate API. Regression-run persistence and execution remain part of Phase 7.

---

## 11. Product Scope and Known Limitations

The current product is a controlled API compatibility workbench, not a general-purpose API testing platform.

Important boundaries include:

- Compatibility analysis supports a documented subset of OpenAPI and JSON Schema behavior.
- Unsupported constructs must produce explicit diagnostic information.
- A complete comparison result does not prove runtime compatibility.
- Change-to-test coverage indicates test-case availability, not successful execution.
- Shared-reference impact analysis is bounded and may conservatively over-approximate impact.
- Manual Phase 6 test cases are restricted to GET path operations.
- Regression execution against arbitrary user-provided URLs is outside the v1 security boundary.
- The bundled regression runner is planned for a later development phase.
- AI-assisted test generation is optional and not yet implemented.
- Team collaboration and multi-tenant organizations are outside the current scope.
- Public deployment and CI release automation remain planned activities.

---

## 12. Roadmap

The remaining development sequence is:

1. Implement the bundled Demo Store regression runner.
2. Implement baseline response-schema validation during execution.
3. Build test-run persistence and historical evidence.
4. Implement optional consent-gated AI test suggestions.
5. Complete the primary frontend workflows.
6. Perform comprehensive security, integration, and end-to-end testing.
7. Prepare CI and deployment.
8. Complete the v1 release acceptance checklist.

The Phase 6 change-impact, test-case management, and coverage-projection milestone has been completed. The Phase 5 paired analyzer-fixture audit remains a separate outstanding verification item.

Each phase must be validated before subsequent features are treated as complete.

---

## 13. Documentation

The `docs/` directory contains the detailed product and technical specifications.

| Document | Description |
|---|---|
| `PRD.md` | Product Requirements Document |
| `Design.md` | UI and UX design system |
| `TRD.md` | Technical Requirements Document |
| `Architecture.md` | System architecture and module responsibilities |
| `AppFlow.md` | Application flow and user journeys |
| `Schema.md` | MongoDB data model and relationships |
| `API.md` | Backend API specification |
| `Rules.md` | Compatibility rules and classifications |
| `SecurityReview.md` | Security requirements and threat model |
| `ImplementationPlan.md` | Development phases, milestones, and progress tracker |

The `examples/` directory contains the synthetic Demo Store OpenAPI specifications and their documented expected changes.

---

## 14. Development Philosophy

ContractGuard is being developed around several engineering principles:

- Deterministic compatibility analysis over AI-generated classifications.
- Explicit handling of unsupported specification constructs.
- Separation of parsing, normalization, analysis, traceability, and execution.
- Strong server-side validation and ownership enforcement.
- Immutable specification versions and historical evidence.
- Test-driven development for compatibility rules.
- Bounded and controlled regression execution.
- Optional AI rather than mandatory AI dependency.
- Minimal infrastructure and maintainable application boundaries.

The objective is not merely to build an interface that compares two JSON documents.

It is to build an understandable, verifiable engineering workflow that connects API contract changes to their potential impact and the tests needed to evaluate them.

---

## 15. License

A repository-level open-source license has not yet been selected.

Until a license is added, no open-source reuse permissions should be assumed.
