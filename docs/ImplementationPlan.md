
# ContractGuard — Implementation Plan

**Version:** 1.3
**Last updated:** 11 November 2026
**Development approach:** Incremental, test-driven modular monolith
**Primary language:** JavaScript

## 1. Purpose

This document defines the development roadmap, implementation status, verification requirements, and release milestones for ContractGuard.

It is the central development tracker. Implementation status must reflect actual code, automated test results, and browser verification rather than the existence of source files alone.

The Product Requirements Document (PRD) remains the source of truth for product scope and priorities.

## 2. Development Principles

1. Preserve the existing application architecture and working functionality.
2. Inspect dependencies, APIs, imports, exports, and tests before modifying code.
3. Keep compatibility analysis deterministic and independent of AI.
4. Separate parsing, normalization, analysis, traceability, and execution.
5. Validate untrusted input and enforce resource ownership on the backend.
6. Preserve immutable specification versions and historical comparison results.
7. Test new functionality before treating it as complete.
8. Avoid unnecessary dependencies, infrastructure, and architectural complexity.
9. Distinguish implementation, automated verification, and acceptance.
10. Document known limitations honestly.

## 3. Implementation Priorities

| Priority | Meaning |
|---|---|
| P0 | Required for the v1 release |
| P1 | Important enhancement |
| P2 | Deferred or optional functionality |

## 4. Development Roadmap

| Phase | Deliverable | Priority | Status |
|---|---|---|---|
| 0 | Documentation and scope | P0 | Baseline established; consistency review ongoing |
| 1 | Application foundation | P0 | Core implemented; clean-checkout acceptance pending |
| 2 | Authentication and projects | P0 | Core implemented; security acceptance pending |
| 3 | OpenAPI ingestion and normalization | P0 | Core implemented; complete parser audit pending |
| 4 | API Explorer | P0 | Core workflows browser-verified; additional checks pending |
| 5 | Compatibility analysis engine | P0 | Core implemented; paired analyzer-fixture audit pending |
| 6 | Change-to-test traceability | P0 | Completed and verified |
| 7 | Bounded regression runner | P0 | Not implemented |
| 8 | Optional AI test suggestions | P1 | Not implemented |
| 9 | Frontend completion | P0 | In progress |
| 10 | Comprehensive testing and security | P0 | Pending |
| 11 | CI, deployment, and release | P0 | Pending |

## 5. Outstanding Verification Before Release

The following checks remain open from earlier phases.

| Phase | Outstanding work |
|---|---|
| 0 — Documentation | Complete cross-document consistency review and verify bundled examples. |
| 1 — Foundation | Verify clean-checkout startup and environment configuration. |
| 2 — Authentication | Complete origin/CSRF and cross-user authorization audits. |
| 3 — Ingestion | Audit circular and unresolved references, parser limits, and supported OpenAPI constructs. |
| 4 — API Explorer | Verify request-body inspection, filtering, error states, unsupported constructs, and hostile-content handling. |
| 5 — Compatibility | Complete paired baseline/candidate analyzer fixtures for every applicable documented rule. |

These items must not be represented as completed until their respective checks have been performed.

---

## 6. Phase 5 — Compatibility Analysis Engine

**Priority:** P0
**Status:** Core implemented and integrated; final analyzer-fixture audit outstanding.

### Scope

The compatibility engine performs deterministic, directional comparisons between baseline and candidate OpenAPI specifications.

**Comparison direction:**

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

**Ruleset:**

`CG-COMPAT-1.1`

Implemented capabilities include:

- Canonical operation matching.
- Path, operation, parameter, request, response, and schema comparisons.
- Deterministic finding identifiers and ordering.
- Compatibility classifications and explanations.
- Source JSON Pointers.
- Affected-operation information.
- Unsupported-feature diagnostics.
- Partial-analysis reporting.

### Verification record

The latest complete backend test run, performed on 11 November 2026, reported:

- 40 test files passed.
- 442 tests passed.

The mapping and finding-contract fixtures cover all 52 documented compatibility rule IDs.

**Remaining limitation:** Mapping and finding-contract fixtures do not establish complete paired baseline/candidate analyzer coverage for every applicable rule. That audit remains outstanding.

The engine must not be described as exhaustively verified until the paired analyzer fixtures have been completed.

---

## 7. Phase 6 — Change-to-Test Traceability

**Priority:** P0

**Status:** Completed and locally accepted on 11 November 2026.

### Implemented scope

**Reference impact analysis**

- Reverse-reference impact analysis.
- Directly and indirectly affected-operation identification.
- Canonical operation-key preservation.
- Bounded reference traversal.
- Unresolved and circular reference diagnostics.

**Test-case management**

- Baseline-version-specific test cases.
- Manual test-case creation and editing.
- Canonical operation-key association.
- Bounded path and query parameter inputs.
- Structured response assertions.
- Draft, approved, and archived lifecycle states.
- Authenticated test-case APIs.
- Server-side ownership and baseline validation.

**Traceability and coverage**

- Finding-to-operation association.
- Baseline test-case retrieval.
- Operation-complete coverage calculation.
- Draft, approved, and archived case handling.
- Comparison-level coverage projections.
- Preservation of historical comparison findings.

**Frontend integration**

- Test-case library and editor.
- Creation, editing, approval, and archival workflows.
- Application navigation and routing.
- Comparison coverage presentation.

### Verification evidence

**Backend**

- 40 test files passed.
- 442 tests passed.
- Database-backed integration tests passed as part of the complete suite.

**Frontend**

- ESLint passed.
- Vite production build passed.

**Browser acceptance**

- Authentication and project access verified.
- Comparison findings inspected.
- Manual test cases created and approved.
- Comparison-level coverage verified against approved test cases.
- Test-case library showed 2 approved cases, 0 drafts, and 0 archived cases.

The verified sample comparison reported:

| Coverage state | Findings |
|---|---:|
| Covered | 7 |
| Draft-only | 0 |
| Uncovered | 0 |
| Unmapped | 0 |

### Known limitations

- Reference-impact analysis uses conservative operation-scope reference closure and may over-approximate impact.
- Manual test-case creation is restricted to supported GET path operations.
- Combined path and query parameter inputs are limited to 20 per test case.
- Coverage represents test-case availability, not successful execution.



**Phase 6 acceptance:** The implemented change-impact, test-case management, and coverage-projection functionality has passed its recorded local verification and browser acceptance.

Regression execution is not included in this acceptance. It belongs to Phase 7.

---

## 8. Phase 7 — Bounded Regression Runner

**Priority:** P0
**Status:** Not implemented.

### Objective

Execute approved baseline test cases against a trusted bundled candidate implementation and validate candidate responses against baseline response contracts.

### Implementation scope

**Trusted execution**

- Finalize and verify Demo Store fixtures.
- Register trusted specification hashes and implementation profiles.
- Support only explicitly approved fixture operations.
- Use a server-controlled in-process execution adapter.
- Reject arbitrary URLs, hostnames, ports, and network destinations.

**Test execution**

- Execute approved test cases only.
- Support bounded GET operations.
- Construct requests from validated test-case inputs.
- Enforce timeouts and response-size limits.
- Evaluate explicit assertions.
- Validate candidate responses against baseline response schemas.

**Persistence**

- Implement TestRun storage.
- Associate every run with an exact comparison.
- Preserve baseline and candidate version identifiers.
- Store bounded execution snapshots and individual results.
- Support queued, running, completed, failed, partial, and interrupted states.
- Recover unfinished runs safely.

### Initial execution limits

| Constraint | Limit |
|---|---:|
| Test cases per run | 20 |
| Concurrent runs | 2 |
| Concurrent tests per run | 2 |
| Per-test timeout | 5 seconds |
| Total run deadline | 60 seconds |
| Response body | 256 KiB |
| Stored evidence per result | 16 KiB |
| Validation diagnostics per result | 50 |

These limits must be enforced by the backend.

### Frontend scope

- Select eligible approved test cases.
- Display execution eligibility and selection count.
- Start a regression run.
- Display progress and completion status.
- Inspect individual results and validation diagnostics.
- Review historical test runs.

### Acceptance criteria

- Only approved baseline cases execute.
- Only trusted bundled implementations are eligible.
- Candidate responses are checked against baseline schemas.
- Execution limits are enforced.
- Results are persisted and linked to their comparison.
- Arbitrary network execution is not possible through client inputs.

**Milestone:** Working bounded regression runner.

---

## 9. Phase 8 — Optional AI-Assisted Test Suggestions

**Priority:** P1
**Status:** Not implemented.

### Objective

Generate additional structured test suggestions for eligible synthetic Demo Store operations.

### Implementation scope

- Verify provider models, quotas, and data-use terms.
- Configure backend-only provider credentials.
- Restrict generation to approved synthetic context.
- Present the provider-submission preview.
- Require explicit user consent.
- Validate generated output using the application's schemas.
- Verify operation and parameter references.
- Store suggestions as draft test cases.
- Require human review and approval.
- Handle provider errors, timeouts, and quota exhaustion.

### Security restrictions

- Do not submit arbitrary user-uploaded specifications.
- Do not submit production data or credentials.
- Do not allow AI to classify compatibility.
- Do not allow AI to determine regression pass/fail.
- Do not allow AI to approve its own suggestions.
- Do not accept AI-generated executable code.
- Keep core ContractGuard functionality independent of AI availability.

**Milestone:** Optional, consent-gated AI test-suggestion workflow.

---

## 10. Phase 9 — Frontend Completion

**Priority:** P0
**Status:** Core screens exist; complete end-to-end acceptance pending.

### Remaining work

- Finalize project and specification workflows.
- Complete API Explorer acceptance checks.
- Verify comparison creation and finding navigation.
- Complete test-case management acceptance.
- Verify every coverage state.
- Integrate the regression-runner interface after Phase 7.
- Integrate optional AI review after Phase 8.
- Verify loading, empty, error, and partial-analysis states.
- Check responsive layout, keyboard navigation, and visible focus.
- Verify safe presentation of uploaded specification content.

### Acceptance criteria

- Users can complete the implemented core workflows through the interface.
- Backend responses remain the source of truth.
- Coverage and execution results are clearly distinguished.
- Unimplemented capabilities are not presented as available.
- Navigation preserves project and comparison context.

**Milestone:** Complete v1 frontend workflows.

---

## 11. Phase 10 — Comprehensive Testing and Security

**Priority:** P0
**Status:** Pending comprehensive release review.

### Automated testing

Verify:

- Compatibility rules and directional correctness.
- Operation matching and shared-reference impact.
- Test-case validation and lifecycle transitions.
- Regression request construction and response validation.
- Test-run persistence and recovery.
- AI output validation and consent enforcement.

### Backend integration testing

Verify:

- Registration, login, logout, and authentication cookies.
- Origin/CSRF protection.
- Cross-user and cross-project access rejection.
- Specification upload and duplicate detection.
- Invalid and unsupported specification handling.
- Comparison creation and retrieval.
- Test-case creation, editing, approval, and archival.
- Wrong-baseline rejection.
- Coverage calculations.
- Test-run execution and persistence when implemented.

### Security testing

Verify:

- Invalid and expired JWT rejection.
- Untrusted-origin rejection.
- Oversized upload rejection.
- YAML alias and duplicate-key handling.
- Excessive nesting and parser-resource limits.
- External-reference network prevention.
- Arbitrary server URL and execution destination rejection.
- Ownership and mass-assignment protections.
- Bounded response evidence.
- AI consent and synthetic-context restrictions.

### Performance and compatibility benchmarks

Measure:

- Compatibility classification precision and recall.
- Operation matching correctness.
- Shared-schema impact accuracy.
- Unsupported-feature detection.
- Regression execution duration.
- Maximum validated specification size and operation count.

Every benchmark must record its environment, application version, ruleset version, fixture count, methodology, and actual results.

Do not invent performance or accuracy claims.

### Acceptance criteria

- Required automated tests pass.
- Security-critical checks pass.
- Compatibility findings are reproducible.
- Performance claims are supported by measurements.
- Known limitations are documented.
- No unresolved critical security issue remains.

**Milestone:** Verified v1 release candidate.

---

## 12. Phase 11 — CI, Deployment, and Release

**Priority:** P0
**Status:** Pending.

### Continuous integration

- Configure GitHub Actions.
- Install dependencies from committed lockfiles.
- Run frontend lint and production build.
- Run backend unit and integration tests.
- Run compatibility fixture tests.
- Run selected end-to-end tests.
- Fail the workflow when required checks fail.

### Documentation

Maintain consistency across:

- README.
- PRD.
- Architecture.
- Application flow.
- Technical requirements.
- Database schema.
- API specification.
- Compatibility rules.
- Security review.
- Implementation plan.
- Demo fixture documentation.

### Deployment

- Select the deployment configuration.
- Configure production MongoDB and environment variables.
- Configure HTTPS and secure authentication cookies.
- Build and serve the React frontend.
- Verify same-origin API behavior.
- Verify persistent database storage.
- Test process restart and error recovery.
- Run deployed application smoke tests.

### Release acceptance

- Verify all P0 requirements.
- Pass required backend tests.
- Pass frontend lint and production build.
- Complete primary end-to-end workflows.
- Complete security acceptance checks.
- Verify setup and demonstration instructions.
- Confirm no secrets are committed.
- Verify operation from a clean repository checkout.

**Milestone:** ContractGuard v1 release candidate.

---

## 13. Development and Git Workflow

### Feature development

For each development batch:

1. Inspect the existing repository and relevant files.
2. Understand dependencies, APIs, imports, exports, and calling conventions.
3. Identify the required changes.
4. Preserve existing working functionality.
5. Implement logically related changes together.
6. Provide complete replacement files for manual code changes.
7. Write or update relevant tests.
8. Run focused and full relevant tests.
9. Run frontend lint and build when applicable.
10. Inspect the final Git diff.
11. Update documentation when implemented behavior changes.

Do not rewrite unrelated modules or introduce redundant implementations.

### Git policy

- `main` represents the verified project state.
- Use clear, descriptive commit messages.
- Inspect all changes before staging.
- Do not overwrite unrelated user changes.
- Do not commit or push without explicit authorization.

Suggested commit messages:

```text
feat: add authentication and project management
feat: implement OpenAPI ingestion
feat: implement compatibility engine
feat: add change-to-test traceability
feat: implement bounded regression runner
test: add compatibility regression fixtures
docs: update implementation documentation
```

A phase is not committed or pushed merely because its source files have been prepared.

---

## 14. Final v1 Acceptance Criteria

ContractGuard v1 is ready for release when:

1. The application runs from a clean repository checkout.
2. Users can register, authenticate, and manage projects.
3. Supported OpenAPI specifications can be uploaded and explored.
4. Specification versions remain immutable.
5. Supported API changes are classified deterministically.
6. Every documented compatibility rule has appropriate paired analyzer fixtures.
7. Unsupported constructs produce explicit diagnostics.
8. Shared-schema changes identify supported affected operations.
9. Findings connect to the correct baseline test cases.
10. Coverage uses operation-complete evaluation.
11. Users can manage test cases through the supported lifecycle.
12. Only approved baseline cases execute.
13. Regression execution uses trusted bundled implementations.
14. Candidate responses are validated against baseline schemas.
15. Test runs preserve their comparison context and execution evidence.
16. Resource limits and security controls are enforced.
17. AI remains optional, consent-gated, and human-reviewed.
18. Backend tests, frontend lint, builds, and primary end-to-end tests pass.
19. Security acceptance checks pass.
20. Known limitations and unsupported behavior are documented.

## 15. Progress Management

Use these status markers consistently:

- `[x]` Implemented and verified.
- `[ ]` Not implemented or not verified.
- `[~]` Partially implemented or awaiting specific verification.

Update this document when a milestone is verified.

Every completed milestone must retain:

- Actual implementation status.
- Automated test results.
- Build and lint results, where applicable.
- Remaining acceptance checks.
- Known limitations.

The objective is a maintainable, technically defensible application supported by reproducible evidence—not an inflated checklist of unverified features.

---

**End of Implementation Plan**
