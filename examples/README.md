
# Demo Store API Fixtures

**Fixture set:** ContractGuard Demo Store  
**Fixture version:** 1.1  
**OpenAPI version:** 3.0.3  
**Purpose:** Specification comparison, compatibility-rule testing, shared-schema impact analysis, and bounded regression execution.

## 1. Overview

This directory contains two synthetic OpenAPI specifications used to demonstrate ContractGuard's core workflow.

- `demo-store-v1.yaml`: Baseline API contract.
- `demo-store-v2.yaml`: Candidate API contract.

The two specifications describe different versions of the same demonstration API.

They contain intentional breaking and non-breaking contract changes so that ContractGuard can demonstrate directional compatibility analysis.

These fixtures are synthetic. They contain no real customer data, production credentials, or confidential business information.

## 2. API structure

Both specifications define two GET operations:

| Operation | Description |
|---|---|
| `GET /products` | Retrieve a list of products |
| `GET /products/{productId}` | Retrieve a product by identifier |

Both operations reference the shared `Product` schema.

`GET /products` references it through the `items` array.

`GET /products/{productId}` references it directly in its successful response.

The `Error` schema is also defined for the product-not-found response.

This shared-reference structure is intentional. It allows ContractGuard to demonstrate how a change to one reusable schema component can affect multiple API operations.

## 3. Intentional contract changes

The baseline and candidate specifications contain the following changes.

### 3.1 Breaking changes

| Field | Baseline v1 | Candidate v2 | Expected rule |
|---|---|---|---|
| `Product.price` | `number` | `string` | `RES-002` |
| `Product.description` | Required string property | Removed | `RES-001` |
| `Product.stock` | Required integer property | Removed | `RES-001` |

These changes affect the response contract of both product operations.

Existing consumers may expect a numeric price, a description property, and stock information.

The candidate no longer guarantees the same response structure and data types.

### 3.2 Non-breaking changes

| Field | Baseline v1 | Candidate v2 | Expected rule |
|---|---|---|---|
| `Product.categoryId` | Not present | Added as an optional string property | `RES-005` |
| `limit.maximum` | 50 | 100 | `PAR-005` |

The `categoryId` addition is expected to be non-breaking under ContractGuard's documented open-object assumption because the baseline response schema does not explicitly reject additional properties.

The increased `limit.maximum` makes the candidate request parameter more permissive. Existing baseline-valid requests remain accepted.

These classifications depend on the stated assumptions and supported rule semantics.

## 4. Expected shared-schema impact

The `Product` component is referenced by both product operations.

Consequently, changes to its response properties should identify:

- `GET /products`
- `GET /products/{}`

The second value is the canonical operation key used for matching parameterized paths. The original displayed path remains `/products/{productId}`.

ContractGuard should link these affected operations to test cases belonging to the baseline specification version.

If a relevant reference cannot be resolved, the application must report incomplete impact analysis rather than presenting an exhaustive list.

## 5. Comparison direction

The intended comparison is:

**Baseline consumer → Candidate provider**

- v1 represents the contract expected by existing consumers.
- v2 represents the proposed contract of the new provider.

ContractGuard evaluates whether the candidate preserves the expectations of consumers built against v1.

The compatibility engine must not reverse request and response compatibility rules.

## 6. Regression-testing purpose

The fixtures are intended to support a controlled demonstration workflow.

The bundled candidate implementation should represent the candidate v2 behavior.

Approved test cases are defined against the baseline v1 contract.

During a regression run:

1. ContractGuard selects approved baseline test cases.
2. The server resolves the trusted candidate v2 fixture implementation.
3. The in-process Demo Store adapter executes supported GET operations.
4. Candidate responses are validated against the baseline response schemas.
5. Explicit assertions are evaluated.
6. Individual results and bounded evidence are stored.

The runner must not use a target URL declared by an uploaded OpenAPI document.

The fixtures describe API contracts; they do not independently provide executable server implementations.

## 7. Trusted fixture recognition

The bundled examples are recognized through a server-controlled fixture registry.

The registry maps:

- Exact SHA-256 hash of the bundled specification file bytes.
- Fixture identifier.
- Candidate implementation version.
- Allowed operation keys.

The hashes must be calculated after the final YAML files have been corrected and committed.

The uploaded document's title, description, version label, hostname, or other user-supplied metadata must not be sufficient to establish runner eligibility.

Do not use approximate document matching or title-based matching to authorize execution.

When a fixture changes, its trusted hash must be recalculated and the registry updated through an explicit code change and corresponding tests.

## 8. Fixture security restrictions

These specifications must not contain external server targets.

The `servers` blocks are intentionally omitted.

Additional requirements:

- No external `$ref` resolution.
- No remote schema fetching.
- No arbitrary network destinations.
- No user-controlled execution URL.
- No executable examples.
- No production credentials or personal information.
- No arbitrary test scripts.

The runner uses a trusted server-side in-process adapter.

## 9. Expected validation cases

The fixture set should be used to verify the following behavior:

| Test area | Expected behavior |
|---|---|
| Operation matching | Both product operations are matched across versions |
| Shared schema references | Both operations are identified as affected by `Product` changes |
| Response type compatibility | `price` type change is classified as breaking |
| Response property removal | `description` removal is classified as breaking |
| Response property removal | `stock` removal is classified as breaking |
| Optional response property addition | `categoryId` is classified as non-breaking under the open-object assumption |
| Request parameter broadening | Increased `limit.maximum` is classified as non-breaking |
| Test coverage | Baseline tests are linked to affected operations |
| Response validation | Candidate response is validated against the baseline schema |
| Runner eligibility | Exact trusted fixture content is required |
| Determinism | Identical inputs and ruleset produce identical findings |

## 10. Important limitations

These fixtures demonstrate a deliberately small part of OpenAPI and JSON Schema behavior.

They do not demonstrate complete support for:

- Every OpenAPI 3.0 feature.
- Every OpenAPI 3.1 or 3.2 feature.
- Every JSON Schema 2020-12 vocabulary.
- Complex polymorphic schemas.
- Arbitrary recursive schemas.
- External references.
- Every parameter-serialization style.
- Arbitrary HTTP methods or deployed API targets.

Unsupported constructs must remain visible through diagnostics and partial-analysis states.

These example files are development and demonstration fixtures, not evidence that ContractGuard supports every possible API contract.

## 11. Maintenance rules

When changing either fixture:

1. Update the corresponding YAML file.
2. Update the documented change catalogue.
3. Review all affected operations and shared references.
4. Update expected compatibility classifications.
5. Update unit-test fixtures.
6. Verify the bundled Demo Store implementation matches the candidate contract.
7. Recalculate exact SHA-256 hashes.
8. Update the trusted fixture registry.
9. Run the complete comparison and regression test suite.

The fixture documentation, OpenAPI specifications, implementation behavior, and expected test outcomes must remain consistent.
