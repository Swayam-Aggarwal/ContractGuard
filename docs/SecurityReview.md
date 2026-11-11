
# Security, Privacy and Reliability Review

**Product:** ContractGuard
**Version:** 1.1
**Status:** Security requirements baseline; implementation verification pending

## 1. Security Objectives

ContractGuard accepts user-supplied API specifications and stores authentication and project data.

The primary security objectives are:

- Protect user accounts and project-owned data.
- Prevent unauthorized access to specifications, reports, and test cases.
- Prevent unsafe file parsing and resource exhaustion.
- Prevent arbitrary network requests originating from imported documents.
- Protect credentials and sensitive application data.
- Prevent AI output from becoming executable or authoritative.
- Preserve the integrity of historical comparison and test records.

This document defines security requirements. It does not claim that a penetration test or security certification has been completed.

## 2. Assets and Trust Boundaries

### 2.1 Assets

- User credentials and password hashes.
- JWT signing secret.
- Optional AI provider API key.
- Uploaded OpenAPI documents.
- Parsed and normalized specifications.
- Project and comparison records.
- Test cases and associated coverage information.
- Future regression execution results.
- Application logs and configuration.

### 2.2 Trust Boundaries

1. Browser to Express API.
2. Uploaded file to parser and normalizer.
3. OpenAPI document to internal reference resolver.
4. Authenticated user to project-owned resources.
5. AI provider request and response boundary.
6. Backend services to MongoDB.

All incoming data must be treated as untrusted, including uploaded documents, filenames, request parameters, AI output, and stored values.

## 3. Threats and Required Controls

| Threat | Risk | Required Control |
|---|---|---|
| Broken object-level authorization | Access to another user's project or report | Ownership-scoped queries and authorization tests |
| Broken authentication | Account takeover | bcrypt hashing, JWT verification, HttpOnly cookie, login rate limiting |
| CSRF | Unauthorized cookie-authenticated actions | SameSite cookie, strict Origin validation for unsafe methods |
| XSS | Script execution through user-controlled content | React text rendering and no unsafe HTML rendering |
| NoSQL injection | Manipulation of database queries | Zod validation and explicit database query construction |
| Malicious upload | Parser abuse or memory exhaustion | File-size limits, content validation and bounded parsing |
| YAML complexity attack | Excessive expansion or parsing cost | Disable aliases and enforce document limits |
| Remote `$ref` SSRF | Unauthorized server-side network access | Reject external references |
| Runner SSRF | Access to internal services | Planned runner restricted to bundled server-controlled fixtures |
| Resource exhaustion | Excessive CPU or memory consumption | Upload, operation, finding, and execution limits |
| AI prompt injection | Unsafe or misleading suggestions | Restricted context, structured output validation and human review |
| AI data exposure | Private specifications sent externally | Explicit consent and synthetic data restriction |
| Secret leakage | Credentials exposed in source or logs | Environment variables, redacted logs and secret rotation |
| Dependency compromise | Vulnerable or malicious packages | Lockfile, dependency review and vulnerability monitoring |

Relevant security guidance: [OWASP API Security](https://owasp.org/API-Security/).

## 4. Authentication Security

Authentication uses bcrypt for password hashing and JWTs stored in HttpOnly cookies.

Requirements:

- Passwords must never be stored in plaintext.
- Password hashes must never be returned through API responses.
- Use an appropriate bcrypt cost factor for the deployment environment.
- JWT signing secrets must come from environment configuration.
- The application must not use a default production JWT secret.
- JWT signatures, expiration, and configured claims must be verified.
- JWTs must never be stored in browser local storage or session storage.
- Authentication cookies must always use `HttpOnly`.
- Cookies must use `SameSite=Lax` or an appropriately restrictive setting.
- `Secure` must be enabled in production.
- Login and registration endpoints must be rate-limited.
- Logout must clear the cookie using matching cookie attributes.
- Expired or invalid tokens must not grant access to protected resources.

The initial target access-token lifetime is 30 minutes. The actual configured lifetime must be documented in the deployment configuration.

V1 does not require a refresh-token database or token blacklist.

## 5. Authorization Security

ContractGuard uses ownership-based authorization. Team-level role-based access control is outside the initial scope.

Every project operation must be scoped to the authenticated user.

Every child-resource operation must verify ownership through its parent project.

The backend must never trust an ownership field supplied by the client.

Required authorization tests:

- User A cannot read User B's project.
- User A cannot update or delete User B's project.
- User A cannot access User B's specification versions.
- User A cannot compare versions belonging to another user.
- User A cannot retrieve another user's comparison reports.
- User A cannot access or modify another user's test cases.
- User A cannot access another user's test-run records when that functionality is implemented.
- Guessing a MongoDB ObjectId must not bypass ownership checks.

Return safe `404` responses for inaccessible resources where appropriate to avoid disclosing whether another user's resource exists.

## 6. Upload and Parser Security

Uploaded specifications are untrusted input.

Required controls:

- Accept only supported JSON and YAML formats.
- Validate content instead of trusting file extensions or browser-provided MIME types.
- Enforce a maximum upload size of 1 MiB.
- Parse bounded files in memory.
- Do not write user-uploaded files to arbitrary filesystem locations.
- Reject malformed documents before accepting them as valid versions.
- Do not execute uploaded content.
- Disable YAML alias expansion.
- Reject unsupported YAML tags and duplicate mapping keys.
- Enforce document-depth and parsed-node limits.
- Bound path entries and operation counts.
- Bound internal reference resolution depth.
- Bound normalized document size.
- Calculate SHA-256 from the original uploaded bytes.
- Preserve original document content separately from normalized data.
- Never render uploaded raw HTML as trusted application content.

Relevant initial limits:

| Limit | Maximum |
|---|---:|
| Upload size | 1 MiB |
| Path entries | 250 |
| Operations | 500 |
| Document nesting depth | 100 |
| Parsed nodes | 50,000 |
| Internal reference depth | 20 |
| Normalized representation | 8 MiB |
| Comparison findings | 5,000 |

Limits must be enforced by the backend rather than relying on frontend validation.

## 7. Reference-Resolution Security

OpenAPI specifications may contain references to other document locations.

ContractGuard must support only the implemented internal reference subset.

Requirements:

- Resolve supported internal JSON Pointer references.
- Reject external HTTP and HTTPS references.
- Do not resolve external filesystem references.
- Detect circular references.
- Enforce a maximum reference depth.
- Preserve unresolved-reference diagnostics.
- Do not silently ignore unsupported reference behavior.
- Mark affected analysis as partial where necessary.

External `$ref` fetching is disabled to prevent Server-Side Request Forgery (SSRF).

Declared OpenAPI `servers` URLs must never be fetched automatically.

## 8. Regression Runner Security

The regression runner is a planned capability and must follow these controls when implemented.

It is restricted to the bundled Demo Store implementation.

Required controls:

- No user-supplied target URL.
- No user-controlled hostname, IP address, port, or redirect destination.
- No arbitrary network destinations.
- Only approved GET test cases may execute.
- Every test case must belong to the comparison's baseline specification version.
- Every selected test case must be approved.
- Execution targets must be selected by the server through a trusted fixture registry.
- Request construction must use validated operation definitions and bounded parameters.
- No arbitrary request headers, authentication credentials, or cookies.
- Response bodies must be bounded before validation.
- Execution concurrency and timeouts must be enforced server-side.
- Test execution must not accept executable scripts or shell commands.

Planned initial execution limits:

| Limit | Maximum |
|---|---:|
| Approved test cases per run | 20 |
| Concurrent runs | 2 |
| Concurrent tests per run | 2 |
| Per-test timeout | 5 seconds |
| Total run deadline | 60 seconds |
| Response body | 256 KiB |
| Stored evidence per result | 16 KiB |
| Validation diagnostics per test | 50 |

The runner must validate candidate responses against baseline response schemas.

It must never become a general-purpose external API proxy.

## 9. AI Privacy and Safety

AI-assisted functionality is optional and planned for a later phase.

Required controls:

- AI functionality must be disabled when provider configuration is unavailable.
- Provider API keys must remain on the backend.
- Explicit user consent is required before external data submission.
- The interface must preview the sanitized context being submitted.
- Unpaid AI-provider requests must be restricted to approved synthetic demonstration data.
- Arbitrary user-uploaded specifications must not be sent.
- Production API contracts and actual production request/response data must not be sent.
- Credentials, secrets, and sensitive headers must be excluded.
- Provider responses must be validated using Zod.
- Malformed or unsupported AI results must be rejected.
- Generated test cases must remain drafts until human approval.
- AI must not decide compatibility classifications or execution results.
- AI output must never be executed as code.
- Provider failures must not disable deterministic application functionality.

Provider pricing, free-tier eligibility, quota limits, and data-use terms must be rechecked when the AI integration is implemented.

## 10. Operational Security

Requirements:

- Enable Helmet security headers.
- Use strict request body limits.
- Apply endpoint-specific rate limits to sensitive operations.
- Validate the request origin for unsafe cookie-authenticated methods.
- Do not allow arbitrary origins in any future cross-origin deployment.
- Keep secrets in environment variables.
- Exclude environment files containing credentials from Git.
- Redact authorization headers, cookies, passwords, and API keys from logs.
- Do not expose internal stack traces in production responses.
- Use safe and consistent error responses.
- Review dependencies before upgrading them.
- Maintain committed package lockfiles.
- Review dependency vulnerabilities before releases.

The intended production architecture is same-origin: Express serves the frontend and API.

## 11. Reliability and Data Integrity

Requirements:

- MongoDB connection failures must be surfaced through application health checks.
- A successful response must not be returned before required persistence operations succeed.
- Specification versions must remain immutable.
- Completed comparison findings must remain unchanged.
- Historical execution results must remain unchanged once finalized.
- Database relationships must be checked explicitly by application services.
- Resource limits must be applied before expensive processing.
- Partial or interrupted operations must never be represented as completed successfully.
- Future unfinished test runs must be marked `INTERRUPTED` after unexpected process restarts.
- Logs must contain sufficient diagnostic information without exposing sensitive data.

## 12. Security Verification Checklist

Before public deployment, verify:

- [ ] No secrets exist in committed source or frontend build output.
- [ ] JWT cookie flags are correct in production.
- [ ] JWT expiration and verification are enforced.
- [ ] Unsafe methods validate trusted request origins.
- [ ] Authentication endpoints are rate-limited.
- [ ] All project and child-resource routes enforce ownership.
- [ ] Cross-user resource access tests pass.
- [ ] Invalid and oversized uploads are rejected.
- [ ] YAML aliases and unsafe constructs are handled safely.
- [ ] External `$ref` references are never fetched.
- [ ] Uploaded server URLs are never executed.
- [ ] No arbitrary execution target can be supplied.
- [ ] AI consent and synthetic-data restrictions are enforced when AI is implemented.
- [ ] AI output cannot execute code or select an execution target.
- [ ] Logs and error responses do not expose secrets.
- [ ] Parser and database resource limits are enforced.
- [ ] Planned runner limits are enforced before runner release.
- [ ] Dependency vulnerabilities have been reviewed.
- [ ] README documentation accurately describes security limitations.

## 13. Review Status

The controls in this document are security requirements.

They must not be considered verified merely because they are documented or implemented in source code.

Verification requires corresponding automated tests or documented manual review.

The implementation tracker must distinguish between:

- Designed.
- Implemented.
- Tested.
- Verified.
