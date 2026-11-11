
# Product Requirements Document (PRD)

**Product:** ContractGuard
**Version:** 1.1
**Status:** Product requirements baseline
**Last Updated:** 11 November 2026

## 1. Product Overview

ContractGuard is a web-based API compatibility and regression-testing workbench. It helps developers understand the impact of API contract changes by comparing versioned OpenAPI specifications, identifying breaking changes, tracing affected operations to test cases, and assessing regression-test coverage.

The platform is designed to make API changes easier to review before they are introduced into a dependent application.

## 2. Problem Statement

Changes to an API can break existing integrations without being immediately obvious. Developers often need to compare specification versions manually, identify affected operations, locate relevant tests, and determine whether sufficient regression coverage exists.

ContractGuard aims to bring these activities into one workflow through specification analysis, change-impact reporting, test traceability, and coverage assessment.

## 3. Product Goals

- Provide a centralized workspace for API projects and specification versions.
- Identify compatibility issues between two OpenAPI specifications.
- Explain which operations and test cases may be affected by a change.
- Track test cases against API operations.
- Make regression-test coverage gaps visible.
- Provide a foundation for controlled regression execution and optional AI-assisted test generation.

## 4. Non-Goals

The initial product is not intended to:

- Replace a complete API development or API gateway platform.
- Guarantee compatibility for behavior not represented in an OpenAPI specification.
- Automatically modify production APIs or client applications.
- Execute arbitrary user-provided scripts.
- Generate and execute AI-created tests without human review.
- Replace a full-featured commercial API testing platform.

## 5. Target Users

**Backend Developers:** Review API contract changes and identify potentially breaking modifications.

**Frontend Developers:** Understand how backend changes may affect application integrations.

**QA Engineers:** Identify affected test cases and assess regression coverage.

**Technical Leads:** Review compatibility reports and understand change-related risks.

## 6. Functional Requirements

### 6.1 Authentication and Accounts

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | Users can register an account. | P0 |
| FR-002 | Users can log in and log out securely. | P0 |
| FR-003 | Users can retrieve their authenticated account information. | P0 |

### 6.2 Project Management

| ID | Requirement | Priority |
|---|---|---|
| FR-004 | Users can create, view, update, and delete their projects. | P0 |
| FR-005 | Projects maintain their associated specifications, comparisons, reports, and test cases. | P0 |

### 6.3 OpenAPI Specification Management

| ID | Requirement | Priority |
|---|---|---|
| FR-010 | Users can upload OpenAPI specifications in JSON or YAML format. | P0 |
| FR-011 | Uploads must respect configured file-size and validation limits. | P0 |
| FR-012 | Uploaded specifications must be parsed and validated before acceptance. | P0 |
| FR-013 | Accepted specifications are stored as identifiable versions with their original content and content hash. | P0 |
| FR-014 | Users can inspect specification operations through the API Explorer. | P0 |
| FR-015 | Specification deletion and archival must preserve the integrity of dependent records. | P1 |

### 6.4 Compatibility Analysis

| ID | Requirement | Priority |
|---|---|---|
| FR-020 | Users can compare a baseline specification against a candidate specification. | P0 |
| FR-021 | The analysis engine evaluates supported compatibility rules. | P0 |
| FR-022 | Findings are classified by severity and compatibility impact. | P0 |
| FR-023 | Comparison records expose their processing status and results. | P0 |
| FR-024 | Users can filter and inspect comparison findings. | P0 |
| FR-025 | Reports identify affected operations and their related test cases. | P0 |
| FR-026 | Changes to shared schemas can be traced to affected operations. | P0 |
| FR-027 | Completed comparison reports remain available for review. | P0 |

### 6.5 Change Impact and Traceability

| ID | Requirement | Priority |
|---|---|---|
| FR-028 | Users can identify the operations affected by specification changes. | P0 |
| FR-029 | Users can trace affected operations to their associated test cases. | P0 |
| FR-030 | Impact analysis must distinguish direct and indirect dependencies where supported. | P0 |

### 6.6 Test Case Management

| ID | Requirement | Priority |
|---|---|---|
| FR-031 | Users can create and view test cases. | P0 |
| FR-032 | Users can update and manage existing test cases. | P0 |
| FR-033 | Test cases can be linked to specification operations. | P0 |
| FR-034 | Test cases support draft, approved, and archived lifecycle states. | P0 |
| FR-035 | Test case approval and archival must follow defined validation rules. | P0 |
| FR-036 | Archived test cases must not count as active regression coverage. | P0 |

### 6.7 Regression Testing

| ID | Requirement | Priority |
|---|---|---|
| FR-037 | The platform should support controlled execution of approved test cases. | P1 |
| FR-038 | Test execution should validate responses against the applicable contract. | P1 |
| FR-039 | Test runs should retain their execution results and relevant evidence. | P1 |
| FR-040 | Execution must enforce configured timeouts, limits, and safety restrictions. | P1 |

### 6.8 Test Coverage

Coverage is measured by the relationship between affected API operations and their associated active test cases.

The platform must distinguish the following states:

| State | Meaning |
|---|---|
| `COVERED` | An affected operation has at least one qualifying approved test case. |
| `DRAFT_ONLY` | An affected operation has draft test cases but no qualifying approved test case. |
| `UNCOVERED` | An affected operation has no qualifying test cases. |
| `UNMAPPED` | The affected operation cannot be reliably mapped to the available test-case records. |

Coverage indicates the availability of qualifying test cases. It does not indicate that those tests have passed.

Archived test cases are excluded from active coverage calculations.

### 6.9 AI-Assisted Test Generation

| ID | Requirement | Priority |
|---|---|---|
| FR-041 | The platform may suggest test cases based on API specifications and compatibility findings. | P2 |
| FR-042 | Generated test cases must remain drafts until reviewed and approved by a user. | P2 |
| FR-043 | AI-generated content must be validated before being stored or used. | P2 |
| FR-044 | AI functionality must be optional and must not be required for core platform operations. | P2 |
| FR-045 | Users must retain control over whether specification data is sent to an external AI provider. | P2 |

## 7. Non-Functional Requirements

### 7.1 Security

- Passwords must be securely hashed using bcrypt.
- Protected resources must require valid authentication.
- Users must only access resources they are authorized to access.
- API endpoints must validate incoming data.
- Uploads and API requests must enforce configured limits.
- Sensitive information must not be exposed through error responses or logs.

### 7.2 Reliability and Data Integrity

- Specification versions must remain identifiable and independently reviewable.
- Comparison results must reference their source specification versions.
- Test cases must maintain valid relationships with their associated projects and operations.
- Failed operations must not leave partially updated records.

### 7.3 Performance

- Specification parsing and comparison must enforce resource limits.
- Large or invalid inputs must not cause uncontrolled processing.
- API responses should remain practical for normal development workflows.

### 7.4 Usability

- The interface must provide clear loading, success, empty, and error states.
- Compatibility findings must be understandable and actionable.
- Users must be able to navigate between projects, specifications, comparisons, and test cases.
- Coverage information must clearly communicate what each status represents.

### 7.5 Maintainability

- Backend functionality should remain organized into routes, controllers, services, models, validators, and middleware.
- Frontend functionality should follow the existing component, page, and feature organization.
- Important business rules must be covered by automated tests.

## 8. Product Success Criteria

ContractGuard will be considered successful when users can:

1. Register, authenticate, and manage their API projects.
2. Upload and inspect valid OpenAPI specifications.
3. Compare specification versions and review compatibility findings.
4. Identify affected operations and trace them to test cases.
5. Manage test cases through their supported lifecycle.
6. Understand regression coverage, including uncovered and unmapped operations.
7. Review results without losing the relationship to the original specification versions.

## 9. Constraints and Assumptions

- The platform uses a React-based frontend and an Express.js backend.
- MongoDB is used for persistent application data.
- OpenAPI specifications are the primary source for contract analysis.
- Compatibility analysis is limited to the rules implemented by the analysis engine.
- Coverage depends on reliable operation and test-case mapping.
- Actual regression execution and AI-assisted generation are separate development milestones.

## 10. Release Priorities

| Priority | Scope |
|---|---|
| P0 | Authentication, project management, specification ingestion, API Explorer, compatibility analysis, impact analysis, test case management, and coverage reporting. |
| P1 | Controlled regression execution, execution history, additional reporting, and operational improvements. |
| P2 | Optional AI-assisted test generation and advanced automation. |

## 11. Current Development Status

As of 11 November 2026:

- Core application foundation, authentication, project management, specification ingestion, and API exploration have been implemented.
- Compatibility analysis and comparison reporting have been implemented.
- Change-impact analysis, test traceability, and test-case management have been implemented and integrated.
- Phase 6 local integration, automated verification, frontend validation, and browser acceptance have been completed.
- Regression execution and AI-assisted test generation remain planned capabilities.

### Phase 5 verification

The latest complete backend verification, performed on 11 November 2026, reported:

- **40 test files passed.**
- **442 tests passed.**

The mapping and finding-contract fixtures cover all 52 documented compatibility rule IDs.

Paired baseline/candidate analyzer fixtures for every applicable rule remain an outstanding verification requirement. Passing the complete automated suite does not establish exhaustive paired-fixture coverage for every compatibility rule.

### Phase 6 verification

Phase 6 change-impact analysis, test traceability, test-case management, and coverage projection were verified locally on 11 November 2026.

**Backend verification:**

- 40 test files passed.
- 442 tests passed.

**Frontend verification:**

- ESLint completed successfully.
- Vite production build completed successfully.

**Browser acceptance:**

- Authentication and project access were verified.
- The comparison workspace and compatibility findings were inspected.
- Manual test cases were created for baseline API operations.
- Test cases were approved through the supported lifecycle.
- Comparison-level coverage was verified against the approved test cases.

The verified sample comparison showed:

- 7 covered findings.
- 0 draft-only findings.
- 0 uncovered findings.
- 0 unmapped findings.

The test-case library showed 2 approved cases, 0 drafts, and 0 archived cases during the acceptance check.

**Phase 6 is accepted for its implemented change-impact, test-case management, and coverage-projection scope.**

Coverage represents the availability of qualifying approved test cases. It does not represent successful regression execution. Regression-run persistence and execution remain part of the subsequent development phase.

### Remaining implementation milestones

- Phase 5 paired analyzer-fixture verification remains outstanding.
- Phase 7 bounded regression execution is not implemented.
- Phase 8 optional AI-assisted test generation is not implemented.
