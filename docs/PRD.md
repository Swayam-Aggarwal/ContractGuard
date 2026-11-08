
# Product Requirements Document (PRD)

**Product:** ContractGuard  
**Document version:** 1.1  
**Status:** Revised baseline for implementation  
**Date:** 7 November 2026  
**Owner:** Project owner

## 1. Executive summary

ContractGuard is a developer workbench for understanding and testing the impact of API contract changes.

A developer imports versioned OpenAPI descriptions, explores operations and schemas, compares a baseline with a candidate version, reviews classified changes, associates changes with affected operations and test cases, and runs approved tests against a controlled demonstration API. An optional AI capability proposes additional test cases for human review.

The product's defining workflow is **change-to-test traceability**:

A user should be able to move from a detected contract change to its affected operation, relevant test cases, regression execution result, and the evidence supporting that result.

ContractGuard uses deterministic compatibility rules for classification and validation. AI is an optional assistant for test ideation; it does not decide whether a change is breaking, execute tests, or determine whether a regression has passed.

## 2. Problem statement

API consumers depend on request and response contracts. A provider change can break a frontend, SDK, integration, or another service even when the changed endpoint still returns a successful HTTP status.

Manual review of two large OpenAPI documents is error-prone. A basic endpoint health check does not establish that the response still conforms to the contract expected by existing consumers.

Developers need a focused workflow that:

- identifies meaningful structural changes between API versions;
- explains why a change may affect existing consumers;
- distinguishes known breaking changes from uncertain or unsupported changes;
- identifies operations affected by changes to shared schemas;
- connects changes to relevant test cases;
- executes approved regression checks against a controlled candidate implementation; and
- records repeatable evidence before a release.

## 3. Product vision and positioning

**Vision:** Make API contract changes understandable and testable before they cause consumer regressions.

**Positioning:** A lightweight, single-user API change-impact workbench for developers. It combines a directional compatibility rules engine, contract validation, change-to-test traceability, bounded regression execution, and optional AI-assisted test ideation.

ContractGuard is not positioned as a new category or a replacement for mature API management, observability, or contract-testing platforms.

Its portfolio differentiation is the integrated and explainable workflow delivered in a deliberately bounded application.

The product demonstrates how specification changes can be connected to affected operations, test coverage, regression evidence, and historical results.

## 4. Goals

1. Import and validate supported OpenAPI descriptions in JSON or YAML.
2. Preserve immutable specification versions within a project.
3. Compare a baseline version with a candidate version using an explicit compatibility direction.
4. Classify supported changes with evidence and clear reasoning.
5. Identify operations affected by direct changes and supported shared-schema references.
6. Make unsupported analysis visible through a `PARTIAL` outcome.
7. Maintain reusable test cases linked to baseline specification operations.
8. Connect detected changes to relevant test cases and identify coverage gaps.
9. Execute a bounded test suite against the bundled Demo Store API.
10. Validate candidate implementation responses against the baseline consumer contract.
11. Offer optional, reviewed AI-generated test suggestions using synthetic demonstration specifications.
12. Produce repeatable reports and benchmark evidence.
13. Provide a polished, accessible developer-focused interface.

## 5. Non-goals

The v1 release will not:

- act as a general API client or unrestricted HTTP proxy;
- execute tests against arbitrary public or private URLs;
- generate or execute JavaScript supplied by an AI model;
- allow AI to classify compatibility or decide regression pass/fail results;
- guarantee semantic compatibility for every OpenAPI or JSON Schema feature;
- silently treat unsupported schema constructs as compatible;
- support Swagger 2.0 in the compatibility engine;
- implement team collaboration, organization billing, or multi-tenant SaaS administration;
- implement CI deployment blocking or a GitHub App integration;
- replace Pact, Schemathesis, Postman, or a full API gateway;
- include Redis, Kafka, Kubernetes, microservices, or a distributed job platform;
- send confidential API specifications, production data, or credentials to an unpaid AI provider;
- provide arbitrary user-controlled request headers, authentication credentials, or network destinations to the regression runner;
- support cancellation of an in-progress test run in v1.

## 6. Target users and primary use cases

### 6.1 Primary persona: Full-stack or backend developer

Maintains a REST API and wants to understand whether a proposed OpenAPI change can break existing consumers.

### 6.2 Secondary persona: Developer learning API engineering

Wants to inspect API contracts, compare versions, create regression cases, and understand schema-validation failures.

### 6.3 Primary use cases

- Create a personal project for an API.
- Upload a baseline and candidate OpenAPI document.
- Explore paths, operations, parameters, request bodies, responses, and schemas.
- Compare two versions and inspect changes by severity.
- Understand which operations may be affected by a changed schema component.
- Review the test cases associated with an affected operation.
- Identify changes that have no approved test coverage.
- Create a test case manually or request AI suggestions for an eligible bundled synthetic fixture.
- Approve, edit, archive, or discard suggested cases.
- Execute approved GET-only cases against the bundled Demo Store candidate implementation.
- Validate candidate responses against the corresponding baseline response contract.
- Review test results and compare historical runs.

## 7. Product scope and functional requirements

Priority definitions:

- **P0:** Required for the v1 release.
- **P1:** Valuable enhancement after P0 requirements are complete.
- **P2:** Deferred beyond v1.

### 7.1 Authentication and project management

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---:|---|
| FR-001 | A user can register with email and password. | P0 | Valid registration creates one account; duplicate email is rejected. |
| FR-002 | A user can log in and log out. | P0 | Auth cookie is set and cleared correctly; invalid credentials return a generic error. |
| FR-003 | A user can view their current account. | P0 | Only the authenticated account is returned. |
| FR-004 | A user can create, view, rename, and delete personal projects. | P0 | Ownership is enforced on every project operation; deletion is soft deletion. |
| FR-005 | Projects have a name, optional description, and timestamps. | P0 | Required fields and length limits are validated. |

### 7.2 Specification management

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---:|---|
| FR-010 | Upload JSON or YAML OpenAPI documents. | P0 | Valid supported documents are accepted; invalid documents show actionable errors. |
| FR-011 | Enforce upload and structural resource limits. | P0 | Oversized files, excessive operation counts, excessive nesting, and excessive reference expansion are rejected or reported with a typed diagnostic. |
| FR-012 | Validate the OpenAPI document. | P0 | Parser diagnostics and support warnings are stored and displayed. |
| FR-013 | Store each upload as an immutable version. | P0 | Re-uploading identical content is detected by a project-scoped SHA-256 hash. |
| FR-014 | Explore API operations and schemas. | P0 | Paths, methods, parameters, request bodies, responses, and supported schema references are navigable. |
| FR-015 | Delete or archive a specification version only when no protected history depends on it. | P2 | Deferred; immutable versions and their historical references remain intact in v1. |

### 7.3 Compatibility analysis

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---:|---|
| FR-020 | Compare a baseline and candidate version in a declared direction. | P0 | The report records baseline, candidate, direction, ruleset version, and creation time. |
| FR-021 | Detect supported path, operation, parameter, request, response, and schema changes. | P0 | Every supported rule has unit fixtures for breaking and non-breaking examples. |
| FR-022 | Classify changes as breaking, potentially breaking, non-breaking, informational, or unsupported. | P0 | Every finding has a rule ID, JSON Pointer/location, summary, and rationale. |
| FR-023 | Return complete, partial, or failed analysis status. | P0 | Unsupported constructs are visible and never silently treated as compatible. |
| FR-024 | Filter and inspect changes. | P0 | Users can filter by classification, path, and HTTP method. |
| FR-025 | Identify operations affected by a detected change and link relevant test cases. | P0 | A change displays its affected operation keys, linked baseline test cases, approval states, and coverage status where supported. |
| FR-026 | Identify shared-schema impact across referencing operations. | P0 | A supported change to a referenced schema identifies all resolvable affected operations; unresolved or unsupported relationships produce a partial-analysis warning. |
| FR-027 | Preserve comparison findings and ruleset history. | P0 | Completed reports retain their original findings, specification references, and ruleset identifier. |

#### Comparison direction

The comparison is performed from:

**Baseline consumer → Candidate provider**

The baseline describes what existing consumers expect.

The candidate describes what the new provider promises to implement.

The compatibility rules must evaluate request and response changes in their respective directions:

- The candidate provider should continue accepting requests valid under the baseline contract.
- The candidate provider should continue producing responses accepted by consumers of the baseline contract.

The comparison engine must be deterministic and must not delegate compatibility decisions to AI.

#### Change-to-test coverage semantics

A comparison change identifies its directly affected operation and, where supported, other operations affected through shared schema references.

ContractGuard links these affected operations to test cases belonging to the comparison's baseline specification version.

Coverage status is derived from the current test-case library:

- `COVERED`: At least one approved linked test case exists.
- `DRAFT_ONLY`: Linked test cases exist, but none is approved.
- `UNCOVERED`: No linked test case exists.

Coverage is not equivalent to successful regression testing.

The actual regression result is displayed separately using the test-run evidence associated with that comparison.

### 7.4 Test-case management and execution

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---:|---|
| FR-030 | Create, edit, approve, archive, and view test cases. | P0 | Test cases are project- and baseline-version-scoped and validated before saving. |
| FR-031 | Link a test case to an API operation. | P0 | Its canonical operation key and original path are stored and validated. |
| FR-032 | Execute approved GET-only tests against the bundled Demo Store candidate implementation. | P0 | Runner cannot target a user-supplied hostname, arbitrary URL, or uploaded server URL. |
| FR-033 | Validate candidate response status, content type, and supported response schema constraints against the baseline contract. | P0 | A failed assertion is recorded with bounded expected and actual evidence. |
| FR-034 | Persist run summaries and individual results. | P0 | A run references its comparison, baseline and candidate versions, selected test cases, status, counts, and bounded result details. |
| FR-035 | Support a maximum of 20 approved test cases per run and bounded execution concurrency. | P0 | The server enforces the configured case count, per-case timeout, concurrency, and total run deadline. |
| FR-036 | Recover or identify runs interrupted by a process restart. | P1 | Unfinished runs are safely marked `INTERRUPTED` and do not silently appear successful. |

#### Test execution model

A test case is defined against the baseline contract.

A test run selects a comparison containing:

- Baseline specification version.
- Candidate specification version.
- Compatibility direction.
- Ruleset identifier.

The runner executes the approved baseline test cases against the bundled implementation associated with the candidate version.

It validates actual candidate responses against the corresponding baseline response contract and any explicit assertions.

A candidate response that satisfies only the candidate specification is not sufficient evidence of backward compatibility.

V1 supports only the bundled Demo Store implementation and approved GET operations.

### 7.5 AI-assisted test suggestions

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---:|---|
| FR-040 | Generate candidate edge-case tests for one selected operation in an eligible bundled synthetic fixture. | P1 | The AI receives only a bounded, sanitized operation context. |
| FR-041 | Require explicit consent before sending context to the provider. | P0 | No provider request occurs without explicit consent and a preview of the shared context. |
| FR-042 | Validate AI output before displaying or storing it. | P0 | Invalid structured output is rejected; AI-generated executable code is never accepted. |
| FR-043 | Require human approval before a suggestion becomes an approved test. | P0 | Suggestions are saved as drafts and cannot execute until approved. |
| FR-044 | Operate without AI credentials or quota. | P0 | Core application remains functional; AI UI explains unavailability. |
| FR-045 | Restrict unpaid AI-provider submissions to bundled synthetic demonstration specifications. | P0 | Arbitrary user-uploaded specifications and production data are never submitted to the unpaid provider. |

AI is advisory.

It cannot:

- Classify a compatibility change.
- Decide a test's pass/fail status.
- Change a test case to approved automatically.
- Select an execution target.
- Generate executable code for the runner.

Provider output must be validated against a strict structured schema. Invalid, malformed, oversized, or unsupported suggestions are rejected.

### 7.6 History and reporting

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---:|---|
| FR-050 | View comparison history. | P0 | Reports can be reopened without rerunning analysis. |
| FR-051 | View test-run history for a comparison. | P0 | Results remain associated with the exact comparison, baseline and candidate versions, ruleset, and selected tests. |
| FR-052 | Export a comparison report as JSON. | P1 | Export contains rule IDs, classifications, locations, affected operation keys, and analysis status. |
| FR-053 | View change-to-test coverage and regression evidence together. | P0 | The user can distinguish uncovered changes, approved test coverage, and actual pass/fail/partial execution results. |

## 8. Quality attributes

- **Correctness:** Directional compatibility rules and response validation must have fixture-based tests.
- **Transparency:** Every classification must identify its rule and evidence.
- **Traceability:** Changes must connect to affected operations, baseline test cases, and execution evidence where available.
- **Safety:** Unsupported constructs and incomplete analyses must remain explicit.
- **Security:** Uploaded documents and user-owned resources are isolated and bounded.
- **Execution isolation:** The test runner only executes approved requests against the bundled candidate implementation.
- **Privacy:** Unpaid AI-provider requests are limited to synthetic demonstration context with explicit consent.
- **Usability:** The primary comparison result should be understandable without reading raw JSON.
- **Accessibility:** Keyboard navigation, visible focus, semantic controls, and WCAG 2.2 AA-oriented contrast.
- **Maintainability:** A modular monolith with clear parser, comparison, validation, runner, and AI boundaries.
- **Cost:** Local development and the optional demo deployment must not require paid services.

## 9. Success measures

Product success is measured with reproducible benchmark fixtures, not invented production claims.

- Compatibility precision and recall on a labelled change fixture set.
- Number of supported OpenAPI operations successfully analyzed.
- Percentage of supported regression cases executed successfully against the bundled demo implementation.
- Test-run completion time under a documented environment and workload.
- Number of unsupported constructs correctly surfaced as partial analysis.
- Percentage of detected changes linked to the expected affected operations in the shared-schema fixture set.
- Percentage of breaking changes with at least one approved linked test case.
- AI suggestion acceptance and correction rates on a reviewed synthetic sample.
- Critical security tests passing, including ownership checks, upload limits, CSRF checks, and prevention of arbitrary network execution.

No numeric performance target is committed until a baseline run is recorded.

## 10. Constraints and assumptions

- The project is built by one developer with existing JavaScript, React, Node.js, Express, MongoDB, and Git knowledge.
- JavaScript is used throughout the implementation; TypeScript is excluded.
- The initial release is a single-user application; team collaboration and billing are out of scope.
- MongoDB is the primary database.
- The AI feature is optional and free-tier-only, subject to provider quotas, availability, and terms.
- Only bundled synthetic Demo Store specifications may be submitted to the unpaid AI provider.
- No paid AI fallback is implemented.
- Public demo deployment may use a free service with cold starts; local execution remains the reliable demonstration path.
- Specification versions and supported schema constructs are explicitly limited in the TRD and Rules documents.
- The runner executes only approved GET operations against a server-controlled bundled implementation.
- Arbitrary external `$ref` resolution and arbitrary target URLs are disabled.
- A test run is associated with one comparison and uses its baseline and candidate versions.
- Historical comparison findings and completed test-run results are immutable.

## 11. Release acceptance criteria

The v1 release is acceptable when:

1. A user can register, log in, and create a project.
2. Valid JSON/YAML OpenAPI files within configured limits can be uploaded and explored.
3. Baseline/candidate comparison produces deterministic, explainable results for every supported rule fixture.
4. Request and response compatibility directions are tested independently.
5. Shared-schema changes identify all supported affected operations.
6. Unsupported constructs produce a partial-analysis status and warning.
7. Comparison changes display linked baseline test cases and coverage status.
8. Users can create, review, approve, and archive test cases.
9. Approved baseline test cases execute against the bundled candidate Demo Store implementation.
10. Candidate responses are validated against baseline response schemas.
11. Test runs preserve the exact comparison, specification versions, ruleset, and result evidence.
12. The runner cannot execute against arbitrary URLs or uploaded server definitions.
13. AI suggestions are optional, restricted to bundled synthetic fixtures, consent-gated, schema-validated, and non-executable until human approval.
14. The application remains fully usable without AI configuration.
15. Security, unit, integration, and primary E2E tests pass.
16. README setup instructions work from a clean checkout.
17. The deployed demo clearly discloses free-tier cold-start and AI limitations.
