# ContractGuard

**API Change-Impact and Regression Testing Workbench**

**Documentation version:** `v1.1`  
**Project status:** Active implementation — Phase 5 compatibility-engine core implemented and integrated; complete per-rule analyzer-fixture audit remains open.

## 1. Overview

ContractGuard is a developer workbench for understanding and testing the impact of API contract changes.

It allows developers to upload versioned OpenAPI specifications, compare a baseline against a candidate version, identify potentially breaking changes, trace changes to affected operations and test cases, and execute approved regression checks against a controlled demonstration API.

An optional AI assistant proposes additional test cases for human review. Deterministic application logic remains responsible for compatibility classifications and regression results.

**Core principle: Make API changes explainable, testable, and traceable.**

## 2. Core workflow

1. Create a personal API project.
2. Upload and validate OpenAPI JSON/YAML specifications.
3. Explore API operations, parameters, request bodies, responses, and schemas.
4. Compare a baseline and candidate specification.
5. Review compatibility findings and their explanations.
6. Identify affected operations and linked baseline test cases.
7. Create, review, and approve test cases.
8. Run approved tests against the bundled candidate implementation.
9. Validate candidate responses against baseline response contracts.
10. Review regression results and historical evidence.

The defining capability is **change-to-test traceability**: connecting a detected API change to affected operations, available test coverage, and actual regression evidence.

## 3. Product scope

### Included in v1

- User authentication and personal projects.
- OpenAPI 3.0.x, 3.1.x, and 3.2.x support within a documented feature subset.
- Immutable specification version history.
- API Explorer.
- Directional compatibility analysis.
- Deterministic compatibility rules.
- Shared-schema impact analysis within supported reference boundaries.
- Change-to-test traceability.
- Test-case management and approval.
- Bounded regression execution against the bundled Demo Store implementation.
- Optional AI-generated test suggestions.
- Comparison history and test-run evidence.

### Excluded from v1

- Arbitrary external API execution.
- General-purpose HTTP proxy functionality.
- Executable AI-generated code.
- Autonomous compatibility decisions.
- Customer-facing GitHub integration or CI gating.
- Team collaboration and multi-tenant administration.
- Distributed job processing and microservices.
- RAG, vector databases, and AI agents.

## 4. Important compatibility semantics

Comparisons use the direction:

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

- **Baseline:** Contract expected by existing consumers.
- **Candidate:** Contract implemented by the new provider.

The candidate must continue accepting baseline-valid requests and producing responses that baseline consumers can process.

Candidate responses are validated against baseline response schemas during regression execution.

Unsupported constructs must remain visible and produce partial-analysis outcomes. They must never be silently treated as compatible.

## 5. Approved technology baseline

| Layer | Technology |
|---|---|
| Runtime | Node.js 24.x |
| Language | JavaScript with ES modules |
| Frontend | React 19.x |
| Build tool | Vite 8.x |
| Routing | React Router 8.x, Declarative Mode |
| Styling | Tailwind CSS 4.x |
| Server state | TanStack Query 5.x |
| Forms | React Hook Form 7.x |
| Backend | Express 5.x |
| Database | MongoDB with Mongoose 9.x |
| Input validation | Zod 4.x |
| Password hashing | bcrypt 6.x |
| OpenAPI parsing | `@scalar/openapi-parser` |
| Schema validation | Ajv 8.x with supported JSON Schema normalization |
| YAML parsing | `yaml` |
| Optional AI | Gemini Developer API through `@google/genai` |
| Unit and integration testing | Vitest |
| API integration testing | Supertest |
| E2E testing | Playwright |
| CI | GitHub Actions |

Node.js 24.x is retained as the current development runtime baseline. Runtime upgrades should be evaluated deliberately rather than performed as part of unrelated dependency changes.

Exact dependency versions are recorded in the respective package lockfiles.

## 6. Security boundaries

- Every project and child resource is protected by server-side ownership checks.
- Passwords are hashed using bcrypt.
- Authentication uses a JWT in an HttpOnly cookie.
- Unsafe cookie-authenticated requests receive CSRF/origin protection.
- Uploads are size-limited and parsed using safe configurations.
- YAML aliases and external `$ref` fetching are disabled.
- Uploaded OpenAPI `servers` URLs are never executed.
- The regression runner uses a server-controlled in-process Demo Store adapter.
- Only approved GET test cases execute.
- No client-controlled execution URLs or network destinations are accepted.
- Candidate responses are validated against baseline response schemas.
- Free-tier AI requests are restricted to bundled synthetic specifications with explicit consent.
- AI suggestions remain drafts until reviewed and approved.
- The application works without AI configuration.

## 7. Repository structure

```text
ContractGuard/
│
├── README.md
├── .gitignore
├── .env.example
├── MANIFEST.json
│
├── client/
│   └── src/
│
├── server/
│   └── src/
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

## 8. Documentation index

| Document | Purpose |
|---|---|
| `PRD.md` | Product requirements, scope, priorities, and acceptance criteria |
| `Design.md` | Precision Workbench visual system, screens, components, and accessibility |
| `TRD.md` | Runtime, dependencies, technical requirements, and supported features |
| `Architecture.md` | Application architecture, module boundaries, and data flow |
| `AppFlow.md` | User journeys, workflows, and application states |
| `Schema.md` | MongoDB collections, relationships, indexes, and data lifecycle |
| `API.md` | Backend endpoints, request contracts, and response conventions |
| `Rules.md` | Compatibility direction, classifications, and deterministic rules |
| `SecurityReview.md` | Threat model, security controls, privacy, and security tests |
| `ImplementationPlan.md` | Development phases, milestones, tracker, and release checklist |
| `examples/README.md` | Demo Store fixtures and expected compatibility changes |

The original requests for separate phase, tracker, and TODO documents are consolidated into `ImplementationPlan.md` to avoid duplicated and inconsistent task lists.

## 9. Development status

- [x] Product direction defined.
- [x] MVP scope documented.
- [x] Precision Workbench design direction documented.
- [x] Technical architecture specified.
- [x] Database schema defined.
- [x] Backend API contracts documented.
- [x] Compatibility rules documented.
- [x] Security boundaries documented.
- [x] Demo Store example specifications prepared.
- [x] Repository and application structure established.
- [x] Frontend and backend application foundations implemented.
- [x] Core authentication and project workspace implemented.
- [x] Core OpenAPI ingestion and API Explorer workflows implemented.
- [x] Core comparison and report-history workflows implemented.
- [x] Phase 5 compatibility-engine core implemented and integrated.
- [x] Mapping and finding-contract fixtures cover all 52 documented rule IDs.
- [ ] Revalidate the backend suite after the latest report-contract and operation-matching changes.
- [ ] Complete paired baseline/candidate analyzer fixtures for every applicable rule.
- [ ] Complete the full compatibility-engine acceptance audit.
- [ ] Change-to-test traceability implemented.
- [ ] Regression runner implemented.
- [ ] Complete v1 workflows verified.

**Phase 5 verification note — 11 November 2026:** The backend suite previously passed 37 test files and 426 tests. The mapping and finding-contract matrix covers all 52 documented rule IDs. That test result predates the latest report-contract and operation-matching updates, so the suite must be run again before treating the current source state as verified. Mapping fixtures are not a substitute for paired end-to-end analyzer fixtures.

## 10. Local development

The development setup uses:

- Vite for the React frontend.
- Express for the backend API.
- MongoDB for persistent application data.

During development, Vite proxies `/api` requests to Express.

In production, Express serves the built React application and API from the same origin.

The application must remain usable without an AI provider key or paid service.

### Backend

From the `server` directory:

```bash
npm start
```

Run the backend test suite from the same directory:

```bash
npm test
```

### Frontend

From the `client` directory:

```bash
npm run dev
```

Run frontend linting:

```bash
npm run lint
```

Create the production build:

```bash
npm run build
```

Environment-specific values belong in the root `.env` file. Do not commit secrets or real credentials.

## 11. Important limitations

- Compatibility analysis covers only the supported constructs documented in `TRD.md` and `Rules.md`.
- A complete compatibility report does not prove real-world runtime compatibility.
- Partial analysis must be displayed honestly.
- Regression execution is restricted to the bundled Demo Store implementation in v1.
- Arbitrary user-uploaded API targets cannot be executed.
- AI suggestions are optional and restricted to synthetic demonstration context.
- Free hosting and AI quotas are subject to provider terms and may change.
- The ContractGuard public brand name remains provisional until name and domain availability are checked.

## 12. License

No open-source license has been selected.

A license will be added only after the project owner makes that decision.