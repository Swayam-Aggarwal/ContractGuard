# Demo Store API Fixtures

The Demo Store fixtures provide a controlled synthetic API for demonstrating ContractGuard's specification ingestion, compatibility analysis, change-impact assessment, and regression-testing workflows.

The fixture set contains two versioned OpenAPI documents:

| File | Role | API version |
|---|---|---|
| `demo-store-v1.yaml` | Baseline contract | `1.0.0` |
| `demo-store-v2.yaml` | Candidate contract | `2.0.0` |

Both documents use OpenAPI `3.0.3`.

## 1. Purpose

The Demo Store API provides a repeatable example of an API evolving between versions.

It is used to demonstrate how ContractGuard:

1. Imports and validates an OpenAPI document.
2. Preserves specification versions.
3. Compares a baseline with a candidate.
4. Identifies and classifies contract changes.
5. Resolves supported references.
6. Identifies affected API operations.
7. Connects findings to baseline test cases.
8. Executes eligible approved tests against a controlled candidate implementation.

The fixtures are synthetic and are not intended to represent a production API.

## 2. Fixture Roles

### `demo-store-v1.yaml`

This is the baseline consumer contract.

It represents the API behavior and response expectations that existing consumers may rely upon.

### `demo-store-v2.yaml`

This is the candidate provider contract.

It intentionally changes selected parts of the contract to demonstrate the effect of API evolution.

Examples of documented fixture changes include:

- A response property's data type changing.
- Existing response properties being removed.
- Optional response properties being introduced.
- Other supported schema or operation-level changes.

The compatibility engine determines the actual findings using `CG-COMPAT-1.1`.

This document describes the purpose of the fixtures; it does not replace executable compatibility tests or the generated comparison report.

## 3. Expected Comparison Behavior

The comparison direction is:

`BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER`

The baseline describes what existing consumers may send and process.

The candidate is evaluated to determine whether it preserves those supported expectations.

The resulting report may contain:

- `BREAKING`
- `POTENTIALLY_BREAKING`
- `NON_BREAKING`
- `INFORMATIONAL`
- `UNSUPPORTED`

The overall analysis status may be:

- `COMPLETE`
- `PARTIAL`
- `FAILED`

An unsupported relevant construct must remain visible as an incomplete analysis condition.

The expected result must be determined by the implemented ruleset and fixture content rather than a hardcoded summary in this README.

## 4. Regression Execution

The bundled regression runner uses a trusted server-side fixture registry.

Execution eligibility is based on the registered fixture content and supported implementation profile.

A fixture's title, version label, or declared `servers` value does not establish execution eligibility.

The runner:

- Executes supported GET operations only.
- Uses a server-controlled in-process implementation adapter.
- Does not target arbitrary uploaded server URLs.
- Selects approved test cases associated with the comparison's baseline version.
- Validates candidate responses against the baseline response contract.
- Persists bounded test results and evidence.

## 5. AI Test Suggestions

The optional Gemini integration uses trusted synthetic context from the Demo Store fixture set.

Currently supported operations:

| Operation ID | Method | Path |
|---|---|---|
| `listProducts` | GET | `/products` |
| `getProduct` | GET | `/products/{productId}` |

The provider-submission preview is displayed before generation.

Explicit user consent is required.

Valid AI suggestions are saved as draft test cases and require human review and approval before execution.

The fixtures contain no real customer data or production credentials.

## 6. Fixture Integrity

The regression runner uses a trusted fixture registry.

Changes to either YAML file may alter its SHA-256 content hash and therefore its runner eligibility.

When updating a fixture:

1. Review its intended API contract changes.
2. Update the corresponding candidate implementation where required.
3. Update the trusted fixture registry.
4. Update compatibility and regression test fixtures.
5. Re-run the relevant automated tests.
6. Verify the upload, comparison, impact, and execution workflows.

Do not modify a fixture merely to make a comparison report display a preferred classification.

## 7. Limitations

- The fixtures represent synthetic API contracts.
- They do not cover every OpenAPI construct.
- They do not establish production runtime compatibility.
- The regression runner supports only the documented bundled operations.
- AI suggestions are advisory and require human approval.