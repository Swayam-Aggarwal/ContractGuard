# Compatibility Rules and Analysis Semantics

- **Product:** ContractGuard
- **Ruleset:** `CG-COMPAT-1.1`
- **Comparison direction:** Baseline consumer → candidate provider
- **Status:** Normative v1 rule baseline

## 1. Purpose

This document defines the deterministic rules used by ContractGuard to compare two OpenAPI specification versions. It is the source of truth for compatibility classifications, change reports, and rule-level test fixtures.

ContractGuard asks:

> If a consumer was built against the baseline contract, can it continue communicating with a provider that implements the candidate contract?

This is a directional, consumer-oriented backward-compatibility assessment.

- **Baseline:** The API contract known to existing consumers.
- **Candidate:** The new API contract implemented by the provider.
- **Consumer:** An application that sends requests and processes responses according to the baseline contract.
- **Provider:** The API implementation that is expected to follow the candidate contract.

The reverse comparison direction is not supported in v1. Reversing the baseline and candidate may produce different results.

## 2. Classifications

| Classification | Meaning |
|---|---|
| `BREAKING` | Strong evidence that a valid baseline consumer may fail because the candidate no longer accepts an existing request or may produce a response the consumer cannot process. |
| `POTENTIALLY_BREAKING` | The change may break consumers depending on generated clients, strict validators, serialization behavior, or runtime conventions. |
| `NON_BREAKING` | The supported rule indicates that the change should preserve baseline consumer behavior under the stated assumptions. |
| `INFORMATIONAL` | Documentation or metadata changed without an identified contract impact. |
| `UNSUPPORTED` | The change involves a construct that the current ruleset cannot reliably analyze. |

### 2.1 Overall analysis status

| Status | Meaning |
|---|---|
| `COMPLETE` | Every relevant compared construct was analyzed using supported rules. |
| `PARTIAL` | One or more relevant constructs could not be fully analyzed. |
| `FAILED` | Parsing, normalization, or comparison encountered an unrecoverable error. |

A report with unsupported changes must never be represented as fully compatible.

A `COMPLETE` report does not mean that the candidate API implementation has been proven correct. It only means that the supported specification changes were analyzed successfully.

## 3. Fundamental compatibility principles

Request and response compatibility operate in opposite directions.

### 3.1 Request compatibility

An existing consumer may send any request that was valid under the baseline contract.

The candidate provider must continue accepting those requests.

Therefore:

**The candidate request schema should accept at least all values accepted by the baseline request schema.**

Examples:

| Baseline request | Candidate request | Expected result |
|---|---|---|
| `age`: integer, minimum 0 | `age`: integer, minimum 18 | `BREAKING` |
| `age`: integer, minimum 0 | `age`: integer, minimum 0 | `NON_BREAKING` |
| `age`: integer, minimum 0 | `age`: integer, minimum -10 | `NON_BREAKING` |
| Enum: `INR`, `USD` | Enum: `INR` | `BREAKING` |
| Enum: `INR` | Enum: `INR`, `USD` | `NON_BREAKING` |

A stricter candidate request schema may reject values that existing baseline consumers are allowed to send.

A broader candidate request schema generally preserves existing requests.

### 3.2 Response compatibility

An existing consumer may rely on the response structure and values described by the baseline contract.

The candidate provider must continue producing responses that those consumers can process.

Therefore:

**The candidate response schema should produce values within the set accepted by the baseline response schema.**

Examples:

| Baseline response | Candidate response | Expected result |
|---|---|---|
| `price`: number | `price`: string | `BREAKING` |
| Enum: `INR`, `USD` | Enum: `INR` | `NON_BREAKING` |
| Enum: `INR` | Enum: `INR`, `USD` | `POTENTIALLY_BREAKING` |
| `age`: integer, maximum 100 | `age`: integer, maximum 80 | `NON_BREAKING` |
| `age`: integer, maximum 100 | `age`: integer, maximum 120 | `POTENTIALLY_BREAKING` |

A candidate response schema that allows a wider range of values may produce values that baseline consumers were not designed to handle.

A narrower candidate response schema generally produces a subset of previously documented values.

### 3.3 Schema inclusion principle

When the engine can prove the relationship between two supported schemas:

- **Request:** candidate accepted-input set must contain the baseline accepted-input set.
- **Response:** candidate possible-output set must be contained within the baseline accepted-input set.

The engine must not guess when it cannot prove the relationship.

If a comparison depends on unsupported schema semantics, it must produce an `UNSUPPORTED` finding and make the overall report `PARTIAL`.

## 4. Rule assumptions and limitations

- OpenAPI descriptions may be incomplete or inaccurate.
- The engine analyzes documented contracts, not hidden runtime behavior.
- Existing consumers may send any request valid under the baseline contract.
- Existing consumers may rely on response fields and documented response types from the baseline contract.
- Extra response properties are generally tolerated under the default open-object assumption.
- Strict consumers that reject additional response properties may behave differently.
- Generated SDKs may treat renamed fields, operation identifiers, enum values, and serialization settings more strictly than ordinary HTTP clients.
- A classification is a compatibility signal, not proof that a real implementation is safe.
- Runtime compatibility is verified separately through the bounded regression runner.

## 5. Operation-level rules

Operations are matched using HTTP method and canonicalized path structure.

| Rule ID | Condition | Classification | Rationale |
|---|---|---|---|
| `OP-001` | Baseline path/method operation removed | `BREAKING` | Existing consumers may call an operation that no longer exists. |
| `OP-002` | New operation added | `NON_BREAKING` | Existing operations remain available. |
| `OP-003` | Path template static segment changed | `BREAKING` | Existing request paths may no longer identify the same operation. |
| `OP-004` | Path parameter name changes but template shape remains | `POTENTIALLY_BREAKING` | Generated clients and parameter bindings may change. |
| `OP-005` | `operationId` changes | `POTENTIALLY_BREAKING` | Generated SDKs and operation references may use this identifier. |
| `OP-006` | Summary, description, or tags change only | `INFORMATIONAL` | Documentation metadata changed. |
| `OP-007` | Operation becomes deprecated | `INFORMATIONAL` | Signals possible future removal; current request shape may remain valid. |
| `OP-008` | HTTP method changes | `BREAKING` | Existing consumers may call a method no longer described for the operation. |

### 5.1 Canonical path matching

Path parameters must be normalized for operation matching without discarding their original names.

Example:

- Baseline: `/users/{id}`
- Candidate: `/users/{userId}`

Both paths have the same canonical shape:

`/users/{}`

The engine must match these operations first and then compare the original parameter names. It must not report the change as an unrelated operation removal and addition.

Canonicalization requirements:

1. Preserve static path segments exactly.
2. Replace each path-parameter placeholder with a positional placeholder for matching.
3. Preserve original parameter names for reporting.
4. Compare the names and definitions of corresponding path parameters after operation matching.
5. Treat a changed static segment as a different operation path.
6. Detect ambiguous or invalid path templates and report them rather than guessing.

The OpenAPI restriction against templated paths that differ only in parameter names must be respected.

## 6. Parameter rules

Parameters are resolved from supported path-level and operation-level definitions.

Effective parameters are matched as follows:

- Path parameters: by their position in the canonical path template.
- Query, header, and cookie parameters: by `(name, in)`.
- Operation-level overrides: apply according to OpenAPI parameter override semantics.
- Parameter `$ref` values: resolve supported internal references before comparison.

| Rule ID | Condition | Classification | Rationale |
|---|---|---|---|
| `PAR-001` | New required request parameter | `BREAKING` | Existing consumers may not know they must send it. |
| `PAR-002` | New optional request parameter | `NON_BREAKING` | Existing requests remain valid. |
| `PAR-003` | Existing request parameter removed | `POTENTIALLY_BREAKING` | Consumers may rely on its behavior or generated-client bindings. |
| `PAR-004` | Parameter type/schema becomes narrower | `BREAKING` when proven; otherwise `UNSUPPORTED` | Baseline-valid request values may be rejected. |
| `PAR-005` | Parameter type/schema becomes broader | `NON_BREAKING` when proven | Candidate accepts at least the baseline values. |
| `PAR-006` | Optional parameter becomes required | `BREAKING` | Existing clients may omit it. |
| `PAR-007` | Required parameter becomes optional | `NON_BREAKING` | Candidate continues accepting baseline requests. |
| `PAR-008` | Enum value removed from request parameter | `BREAKING` | Existing clients may send the removed value. |
| `PAR-009` | Enum value added to request parameter | `NON_BREAKING` | Existing valid values remain accepted. |
| `PAR-010` | Parameter serialization, style, or explode changes | `POTENTIALLY_BREAKING` | Wire representation may change. |
| `PAR-011` | Description or example changes only | `INFORMATIONAL` | No structural request change identified. |
| `PAR-012` | Parameter location changes | `BREAKING` | Existing requests send the parameter in a different location than the candidate expects. |

## 7. Request-body rules

| Rule ID | Condition | Classification | Rationale |
|---|---|---|---|
| `REQ-001` | Request body changes from optional to required | `BREAKING` | Baseline consumers may omit it. |
| `REQ-002` | Request body changes from required to optional | `NON_BREAKING` | Candidate continues accepting existing requests. |
| `REQ-003` | Existing request media type removed | `BREAKING` when the removed media type was the only representation used by the baseline consumer; otherwise `POTENTIALLY_BREAKING` | Existing clients may send the removed representation. |
| `REQ-004` | New request media type added | `NON_BREAKING` | An additional representation is available. |
| `REQ-005` | New required request property | `BREAKING` | Baseline clients may not send it. |
| `REQ-006` | Required request property becomes optional | `NON_BREAKING` | Candidate accepts requests that include it and may accept requests that omit it. |
| `REQ-007` | Existing request property removed | `POTENTIALLY_BREAKING` | Existing clients may continue sending it; provider behavior can differ. |
| `REQ-008` | Request property type becomes narrower | `BREAKING` when proven; otherwise `UNSUPPORTED` | Baseline-valid values may be rejected. |
| `REQ-009` | Request enum value removed | `BREAKING` | Existing clients may send the removed value. |
| `REQ-010` | Request constraint becomes stricter | `BREAKING` when proven; otherwise `UNSUPPORTED` | Previously valid request values may be rejected. |
| `REQ-011` | Request constraint becomes broader | `NON_BREAKING` when proven | Candidate accepts at least the baseline range. |
| `REQ-012` | Request property serialization or encoding changes | `POTENTIALLY_BREAKING` | The representation sent by existing clients may no longer be interpreted as expected. |

Examples of stricter request constraints include:

- `minimum` increases.
- `maximum` decreases.
- `minLength` increases.
- `maxLength` decreases.
- `minItems` increases.
- `maxItems` decreases.
- An enum value is removed.

## 8. Response rules

| Rule ID | Condition | Classification | Rationale |
|---|---|---|---|
| `RES-001` | Baseline response property removed | `BREAKING` | Existing consumers may read the property. |
| `RES-002` | Response property type changes incompatibly | `BREAKING` | Consumer parsing or operations may fail. |
| `RES-003` | Baseline-required response property becomes optional | `BREAKING` | Consumers may receive a response without a field they expect. |
| `RES-004` | Optional response property becomes required | `NON_BREAKING` | Candidate guarantees a value that baseline consumers already tolerate as optional. |
| `RES-005` | New response property added | `NON_BREAKING` under the open-object assumption; `POTENTIALLY_BREAKING` if the baseline schema explicitly rejects additional properties | Strict validators may reject additional properties. |
| `RES-006` | Response enum value added | `POTENTIALLY_BREAKING` | Exhaustive consumers may not handle the new value. |
| `RES-007` | Response enum value removed | `NON_BREAKING` | Candidate emits a narrower set of values already allowed by the baseline. |
| `RES-008` | Response constraint becomes narrower | `NON_BREAKING` when proven | Candidate emits a subset of the previously documented values. |
| `RES-009` | Response constraint becomes broader | `POTENTIALLY_BREAKING` when proven; otherwise `UNSUPPORTED` | Candidate may emit values that baseline consumers were not designed to handle. |
| `RES-010` | Response media type removed | `POTENTIALLY_BREAKING` | Existing clients may expect that representation. |
| `RES-011` | Response status code removed | `POTENTIALLY_BREAKING` | Consumers may have explicit handling for that documented outcome. |
| `RES-012` | Description or example changes only | `INFORMATIONAL` | Documentation-only change. |
| `RES-013` | Response property becomes nullable when baseline did not allow null | `POTENTIALLY_BREAKING` | Consumers may not handle null values. |
| `RES-014` | Response property stops being nullable | `NON_BREAKING` when the narrower output set is proven | Candidate no longer emits a previously allowed null value. |

Examples of narrower response constraints include:

- `maximum` decreases.
- `minimum` increases.
- `maxLength` decreases.
- `minLength` increases.
- An enum value is removed.
- An array's maximum number of items decreases.

Examples of broader response constraints include:

- `maximum` increases.
- `minimum` decreases.
- `maxLength` increases.
- `minLength` decreases.
- An enum value is added.
- A previously non-nullable property becomes nullable.

## 9. Security and server metadata rules

| Rule ID | Condition | Classification | Rationale |
|---|---|---|---|
| `SEC-001` | Candidate introduces a required security scheme where baseline had none | `POTENTIALLY_BREAKING` | Existing unauthenticated consumers may fail. |
| `SEC-002` | Required OAuth scopes become more restrictive | `POTENTIALLY_BREAKING` | Existing credentials may lack required scopes. |
| `SEC-003` | Security requirement is relaxed | `INFORMATIONAL` | Compatibility may improve, but security posture may weaken. |
| `SRV-001` | Server URL changes | `INFORMATIONAL` | Deployment location changed; runtime reachability is not tested in v1. |
| `SRV-002` | Server variable or default changes | `POTENTIALLY_BREAKING` | Generated clients or environments may resolve to a different host. |

## 10. Schema comparison scope

The initial comparator supports the following structural elements within explicitly supported schema constructs:

- Primitive `type` changes.
- Object `properties` additions and removals.
- `required` list changes.
- Array `items` type changes.
- Enum additions and removals.
- Common numeric and string bounds.
- Basic array item-count bounds.
- Boolean `additionalProperties` behavior where explicitly supported.
- Nullable behavior where supported by the OpenAPI version.
- Internal `$ref` targets where resolution is bounded and supported.

The following are not fully analyzed by the v1 compatibility ruleset:

- Complex `allOf`, `oneOf`, `anyOf`, and `not` changes.
- Discriminator mapping semantics.
- Recursive or cyclic reference graphs.
- Custom JSON Schema dialects or vocabularies.
- Unrecognized schema keywords that affect validation.
- Callbacks, webhooks, links, and advanced serialization behavior.
- Complex conditional schemas and dynamic references.

If a relevant change depends on unsupported semantics:

1. Add an `UNSUPPORTED` finding.
2. Record the affected JSON Pointer or source location.
3. Explain which construct could not be evaluated.
4. Set the overall report status to `PARTIAL`.
5. Do not silently treat the change as compatible.

### 10.1 Unsupported-analysis diagnostic

| Diagnostic ID | Condition | Classification | Rationale |
|---|---|---|---|
| `SCH-001` | A relevant schema, reference, serialization, security, server, or parser construct cannot be evaluated completely by the supported v1 subset | `UNSUPPORTED` | The analyzer must expose uncertainty rather than silently assigning a compatibility result. |

`SCH-001` is a diagnostic rule identifier. It does not claim that the underlying construct is always breaking; it records that the analyzer cannot prove compatibility. The finding must include the affected source location where available, a stable change ID, a summary, a rationale, and affected operation keys where known. Any report containing `SCH-001` must have `PARTIAL` analysis status.

## 11. Reference-resolution requirements

- Resolve internal document references only.
- Do not fetch external references over the network.
- Detect recursive and cyclic reference graphs.
- Apply a configured maximum reference depth.
- Preserve the original reference location for reporting.
- Do not silently skip unresolved references.
- Treat relevant unresolved or unsupported references as `UNSUPPORTED`.

External references are disabled in v1 to prevent unintended network access and SSRF risks.

## 12. Deterministic comparison algorithm

The implementation must follow a stable sequence:

1. Validate the uploaded OpenAPI document.
2. Identify its OpenAPI version and schema dialect.
3. Normalize supported constructs into ContractGuard's internal representation.
4. Resolve supported internal references with cycle detection and depth limits.
5. Normalize HTTP methods to uppercase.
6. Build canonical path keys while preserving original parameter names.
7. Match operations by canonical path and HTTP method.
8. Compare operation metadata and parameter definitions.
9. Compare request bodies and request schemas.
10. Compare response status codes, media types, and response schemas.
11. Apply the explicit compatibility rules.
12. Generate stable change IDs.
13. Sort changes deterministically.
14. Aggregate classification counts.
15. Mark the report `PARTIAL` if any relevant construct was unsupported.
16. Persist the ruleset identifier and both specification-version identifiers with the report.

### 12.1 Stable change identifiers

Each finding must include:

- `ruleId`
- `operationKey`
- `jsonPointer` or source location
- `classification`
- `changeId`
- `summary`
- `rationale`

The `changeId` must be deterministic for the same rule, operation, and location. It must not depend on random values or execution timestamps.

### 12.2 Sorting

Changes must be sorted consistently by:

1. Canonical path.
2. HTTP method.
3. Classification severity.
4. JSON Pointer or source location.
5. Rule ID.

The same input documents and ruleset must produce the same ordered comparison findings.

## 13. Rule test-fixture requirements

Every implemented rule must have automated tests containing:

- A baseline fixture.
- A candidate fixture.
- The expected rule ID.
- The expected classification.
- The expected operation key.
- The expected JSON Pointer or source location.
- The expected overall analysis status.
- A short rationale.

Tests must include:

- Request compatibility direction.
- Response compatibility direction.
- Enum additions and removals.
- Required and optional field changes.
- Parameter renames.
- Canonical path matching.
- Shared schema references.
- Unsupported schema constructs.
- Cyclic and unresolved references.
- Deterministic output ordering.

For direction-sensitive rules, include paired fixtures that demonstrate why request and response changes are evaluated differently.

## 14. Ruleset versioning

The ruleset identifier is stored with every comparison report.

The current identifier is:

`CG-COMPAT-1.1`

A future change to compatibility semantics must increment the ruleset version.

Historical reports must retain the ruleset identifier used when they were created. They must never be silently reinterpreted using a newer ruleset.

Updating a rule requires:

1. Updating this document.
2. Updating the rule implementation.
3. Adding or updating automated fixtures.
4. Documenting the behavior change.
5. Preserving the historical ruleset identifier for existing reports.