# Product Requirements Document (PRD)

**Product:** ContractGuard\
**Document version:** 1.2\
**Document status:** Product requirements and scope baseline\
**Last updated:** 14 November 2026

---

## 1. Product Overview

ContractGuard is a full-stack API change-impact and regression-testing workbench designed to help developers understand the consequences of changes to versioned API contracts.

The platform imports and validates OpenAPI specifications, compares baseline and candidate versions, identifies compatibility changes, traces affected operations to associated test cases, assesses regression-test coverage, and supports controlled regression execution.

An optional AI-assisted capability generates additional test-case suggestions for supported synthetic API operations. Suggestions are validated and saved as drafts for human review.

The defining capability of ContractGuard is **change-to-test traceability**: connecting a detected API contract change to the operations it affects, the available regression tests, and the execution evidence associated with those tests.

Compatibility analysis and regression results are determined by application logic. AI is an optional assistance layer and does not make compatibility decisions or determine test outcomes.

## 2. Problem Statement

API contracts evolve as applications and services change. An apparently small modification to an endpoint, parameter, request body, response schema, or shared component can introduce a breaking change for existing consumers.

Traditional manual specification review presents several challenges:

- Comparing large OpenAPI documents is time-consuming and error-prone.
- Changes to shared schemas can affect multiple API operations.
- A successful HTTP response does not necessarily mean that the response remains compatible with the previous contract.
- Existing regression tests may not cover every affected operation.
- Test-case coverage and actual execution evidence are often difficult to connect to individual API changes.
- Unsupported contract constructs can create false confidence when they are not explicitly identified.

ContractGuard addresses these challenges through a structured workflow that combines specification analysis, deterministic compatibility rules, change-impact assessment, test traceability, and bounded regression execution.

## 3. Product Vision and Positioning

**Vision:** Make API contract changes understandable, traceable, and testable before they introduce regressions for existing consumers.

**Product positioning:** A developer-focused API compatibility and regression-testing workbench that connects OpenAPI comparison with operation-level impact analysis and test evidence.

ContractGuard is designed as a modular, single-user application. It demonstrates an integrated API engineering workflow rather than attempting to replace a full API management platform, API gateway, observability solution, or commercial contract-testing suite.

## 4. Product Goals

The product aims to:

1. Provide a centralized workspace for API projects and specification versions.
2. Accept supported OpenAPI specifications in JSON and YAML formats.
3. Preserve specification versions as identifiable historical records.
4. Compare a baseline contract against a candidate contract using an explicit compatibility direction.
5. Detect and classify supported API contract changes deterministically.
6. Explain findings through rule identifiers, source locations, and classification rationales.
7. Identify operations affected by direct changes and supported shared-schema references.
8. Associate affected operations with relevant baseline test cases.
9. Distinguish approved test coverage from draft-only coverage and uncovered operations.
10. Execute approved regression test cases against a controlled bundled Demo Store implementation.
11. Validate candidate responses against the applicable baseline response contract.
12. Provide optional AI-assisted test suggestions for supported synthetic operations.
13. Preserve comparison and regression execution evidence for later review.

## 5. Target Users

### 5.1 Backend Developers

Developers maintaining APIs who need to understand whether a proposed contract change can break existing consumers.

Primary needs:

- Compare API specification versions.
- Identify breaking and potentially breaking changes.
- Inspect affected operations.
- Review regression-test coverage.
- Validate candidate behavior against the baseline contract.

### 5.2 Full-Stack Developers

Developers responsible for both API consumers and providers who need visibility into the impact of backend contract changes on dependent application functionality.

Primary needs:

- Inspect endpoint and schema changes.
- Identify affected frontend-facing operations.
- Associate changes with test cases.
- Review regression results and validation failures.

### 5.3 QA and Software Test Engineers

Engineers responsible for maintaining regression coverage across evolving API contracts.

Primary needs:

- Maintain operation-linked test cases.
- Identify missing approved coverage.
- Review AI-generated test suggestions.
- Execute approved tests.
- Inspect test results and supporting evidence.

### 5.4 Developers Learning API Engineering

Developers who want to understand practical API compatibility, OpenAPI structures, schema validation, impact analysis, and regression-testing workflows.

## 6. Product Scope

### 6.1 Authentication and Account Management

ContractGuard supports authenticated application access.

Functional requirements:

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | Users can register using an email address and password. | P0 |
| FR-002 | Users can log in and log out. | P0 |
| FR-003 | Users can retrieve their authenticated account information. | P0 |
| FR-004 | Authentication credentials must not be exposed in normal API responses. | P0 |
| FR-005 | Protected application resources require valid authentication. | P0 |

V1 uses a single-user project ownership model. Organization membership, team roles, and multi-tenant administration are outside the current product scope.

### 6.2 Project Management

| ID | Requirement | Priority |
|---|---|---|
| FR-010 | Users can create personal API projects. | P0 |
| FR-011 | Users can view and update their projects. | P0 |
| FR-012 | Users can soft-delete their projects. | P0 |
| FR-013 | Projects maintain their associated specification versions, comparisons, test cases, and test runs. | P0 |
| FR-014 | Every project operation enforces server-side ownership. | P0 |

### 6.3 OpenAPI Specification Management

| ID | Requirement | Priority |
|---|---|---|
| FR-020 | Users can upload OpenAPI documents in JSON and YAML formats. | P0 |
| FR-021 | Uploaded documents are parsed and validated before being accepted as valid specifications. | P0 |
| FR-022 | Each accepted upload is stored as an identifiable specification version. | P0 |
| FR-023 | Original specification content is preserved. | P0 |
| FR-024 | Duplicate content within a project is detected using content hashing. | P0 |
| FR-025 | Users can explore paths, operations, parameters, request bodies, responses, and supported schemas. | P0 |
| FR-026 | Unsupported constructs and partial-support conditions are visible. | P0 |
| FR-027 | External reference fetching is not performed. | P0 |

### 6.4 Compatibility Analysis

| ID | Requirement | Priority |
|---|---|---|
| FR-030 | Users can compare a baseline specification version with a candidate version. | P0 |
| FR-031 | Comparison direction is explicit and selected by the backend. | P0 |
| FR-032 | Supported contract changes are detected using deterministic rules. | P0 |
| FR-033 | Findings include a rule identifier, classification, source location, summary, and rationale. | P0 |
| FR-034 | Findings can be filtered by classification and operation information. | P0 |
| FR-035 | Unsupported analysis is represented through an explicit partial-analysis status. | P0 |
| FR-036 | Supported shared-schema changes identify affected operations. | P0 |
| FR-037 | Completed comparison findings remain historically consistent. | P0 |

The compatibility direction is:

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

The baseline represents the contract existing consumers may rely upon. The candidate represents the newer provider contract being evaluated.

The analyzer evaluates whether the candidate preserves the supported expectations established by the baseline.

#### Finding classifications

- `BREAKING`
- `POTENTIALLY_BREAKING`
- `NON_BREAKING`
- `INFORMATIONAL`
- `UNSUPPORTED`

#### Analysis statuses

- `COMPLETE`
- `PARTIAL`
- `FAILED`

A `COMPLETE` result means that supported constructs were analyzed successfully. It does not prove the runtime behavior of an independently deployed API implementation.

### 6.5 Change-to-Test Traceability

| ID | Requirement | Priority |
|---|---|---|
| FR-040 | Findings are associated with relevant canonical operation identifiers. | P0 |
| FR-041 | Supported shared-schema impact is propagated to affected operations. | P0 |
| FR-042 | Affected operations are associated with test cases belonging to the baseline version. | P0 |
| FR-043 | Approved test coverage is distinguished from draft-only coverage. | P0 |
| FR-044 | Operations without linked test cases are identified. | P0 |
| FR-045 | Historical comparison findings are not modified by subsequent test-case changes. | P0 |

Coverage states:

- `COVERED`
- `DRAFT_ONLY`
- `UNCOVERED`
- `UNMAPPED`

Coverage represents the availability of linked test cases. It does not represent successful test execution.

### 6.6 Test Case Management

| ID | Requirement | Priority |
|---|---|---|
| FR-050 | Users can create manual test cases. | P0 |
| FR-051 | Test cases are linked to a project, baseline specification version, and API operation. | P0 |
| FR-052 | Test cases support draft, approved, and archived states. | P0 |
| FR-053 | Draft test cases can be edited and reviewed. | P0 |
| FR-054 | Approval is an explicit server-controlled transition. | P0 |
| FR-055 | Archived test cases are excluded from new execution. | P0 |
| FR-056 | Approved test cases cannot be silently changed through ordinary draft-edit operations. | P0 |

### 6.7 Regression Execution

| ID | Requirement | Priority |
|---|---|---|
| FR-060 | Users can initiate regression runs from a valid comparison. | P0 |
| FR-061 | Only approved test cases belonging to the comparison's baseline version are eligible. | P0 |
| FR-062 | Execution uses a server-controlled bundled Demo Store implementation. | P0 |
| FR-063 | The runner supports approved GET operations. | P0 |
| FR-064 | Candidate responses are checked against the baseline response contract. | P0 |
| FR-065 | Individual test results and run summaries are persisted. | P0 |
| FR-066 | Execution evidence is bounded and sanitized. | P0 |
| FR-067 | Unfinished runs are not represented as successful runs. | P0 |

### 6.8 AI-Assisted Test Suggestions

| ID | Requirement | Priority |
|---|---|---|
| FR-070 | Users can request AI-generated test suggestions for supported synthetic operations. | P0 |
| FR-071 | The provider-submission context is previewed before submission. | P0 |
| FR-072 | Explicit user consent is required before provider submission. | P0 |
| FR-073 | Model output is validated against the expected structured format. | P0 |
| FR-074 | Valid suggestions are saved as draft test cases. | P0 |
| FR-075 | AI-generated drafts require human review and approval before execution. | P0 |
| FR-076 | Core compatibility and regression functionality remains independent of AI availability. | P0 |

Current supported AI operations:

| Operation ID | Method | Path |
|---|---|---|
| `listProducts` | GET | `/products` |
| `getProduct` | GET | `/products/{productId}` |

The integration uses the Google Gemini Developer API through the `@google/genai` SDK.

The AI provider does not determine compatibility classifications, approve tests, select execution targets, or determine regression pass/fail results.

### 6.9 Historical Results

| ID | Requirement | Priority |
|---|---|---|
| FR-080 | Users can reopen saved comparison reports. | P0 |
| FR-081 | Users can inspect test-run history for a comparison. | P0 |
| FR-082 | Historical test results preserve their execution snapshots. | P0 |
| FR-083 | Comparison and execution records retain their associated specification versions. | P0 |

## 7. Business and Domain Rules

### 7.1 Comparison Identity

Every comparison must identify:

- Project.
- Baseline specification version.
- Candidate specification version.
- Comparison direction.
- Compatibility ruleset version.
- Analysis status.
- Findings and warnings.

The baseline and candidate must belong to the same project and must be different specification versions.

### 7.2 Test Case Eligibility

A test case belongs to exactly one baseline specification version and one canonical API operation.

A test case can be selected for a comparison run only when:

- It belongs to the comparison's project.
- It belongs to the comparison's baseline specification version.
- It is approved.
- Its operation is supported by the bundled candidate implementation.
- Its inputs and assertions pass backend validation.

### 7.3 AI Draft Integrity

AI-generated suggestions must:

- Be associated with the selected supported operation.
- Match the backend's expected draft structure.
- Pass server-side validation.
- Be persisted as drafts.
- Remain ineligible for execution until approved.

## 8. Non-Functional Requirements

### Correctness

Compatibility classification and response validation must be deterministic and independently testable.

### Explainability

Every finding must provide sufficient information to identify the changed contract element and explain its classification.

### Security

Authentication, ownership checks, input validation, upload limits, and execution restrictions must be enforced by the backend.

### Reliability

AI-provider outages or quota exhaustion must not prevent specification comparison or normal regression functionality.

### Performance

Large specification documents, comparison findings, execution requests, and AI outputs must be bounded by server-side resource limits.

### Maintainability

The application must preserve separation between routes, controllers, services, models, validators, and frontend features.

### Accessibility

Core workflows should support keyboard navigation, visible focus indicators, semantic controls, and accessible feedback.

### Privacy

Only eligible synthetic context may be sent to the configured AI provider. Credentials and confidential production data must not be submitted.

## 9. Out of Scope

The current product scope does not include:

- Arbitrary external API execution.
- Unrestricted HTTP methods.
- Arbitrary user-supplied execution URLs.
- Remote OpenAPI reference fetching.
- AI-generated executable code.
- Automatic approval of generated test cases.
- AI-based compatibility classification.
- AI-determined regression outcomes.
- Team collaboration and organization administration.
- Billing and subscription management.
- Distributed workers or message queues.
- Kubernetes-based deployment.
- A GitHub App or automated deployment-blocking integration.
- Complete behavioral compatibility guarantees for every OpenAPI construct.

## 10. Success Criteria

ContractGuard is evaluated through reproducible test fixtures and explicit workflow verification.

Key measures include:

- Correct classification of supported compatibility fixtures.
- Explicit reporting of unsupported constructs.
- Accurate identification of affected operations.
- Correct mapping of findings to baseline test cases.
- Correct distinction between draft coverage and approved coverage.
- Correct execution eligibility checks.
- Accurate baseline response validation.
- Preservation of historical comparison and run results.
- Rejection of malformed or mismatched AI output.
- Prevention of AI-generated drafts from bypassing human approval.

No production-scale performance or accuracy claim is implied without a separately recorded benchmark.

## 11. Related Documentation

- [Design Specification](Design.md)
- [Technical Requirements](TRD.md)
- [System Architecture](Architecture.md)
- [Application Flow](AppFlow.md)
- [Data Model and Schema](Schema.md)
- [Compatibility Rules](Rules.md)
- [Backend API](API.md)
- [Security Review](SecurityReview.md)
- [Implementation Plan](ImplementationPlan.md)