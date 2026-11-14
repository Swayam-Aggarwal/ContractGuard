# Security, Privacy and Reliability Review

**Product:** ContractGuard\
**Document version:** 1.2\
**Document status:** Security design and verification baseline\
**Last updated:** 14 November 2026

---

## 1. Security Objectives

ContractGuard accepts user-supplied OpenAPI documents and stores authentication, project, comparison, test-case, and test-run data.

Its primary security objectives are:

- Protect user accounts and project-owned data.
- Enforce authorization at the backend.
- Prevent unsafe specification parsing and resource exhaustion.
- Prevent imported documents from causing arbitrary network requests.
- Restrict regression execution to trusted bundled implementations.
- Prevent AI output from becoming executable or authoritative.
- Protect provider credentials and authentication secrets.
- Avoid exposing sensitive request, response, or stored data.
- Preserve reliable historical records.

This document defines security requirements and review criteria. It is not a claim of independent penetration testing, security certification, or production security approval.

## 2. Assets and Trust Boundaries

### 2.1 Protected Assets

- User email addresses and password hashes.
- JWT signing secret.
- Gemini API key.
- Uploaded OpenAPI source documents.
- Parsed and normalized specification data.
- Project and ownership records.
- Compatibility reports and findings.
- Test cases and approval states.
- Regression execution inputs and results.
- AI-generated suggestions and generation metadata.
- Application configuration and logs.

### 2.2 Trust Boundaries

1. Browser to Express API.
2. Uploaded file to parser and normalizer.
3. OpenAPI document to internal reference resolver.
4. Authenticated principal to project-owned resources.
5. AI context builder to Gemini provider.
6. Gemini provider response to application validators.
7. Regression runner to the bundled Demo Store implementation.
8. Express application to MongoDB.

All externally supplied data must be treated as untrusted, including:

- HTTP request data.
- File names and uploaded file contents.
- OpenAPI schemas and references.
- User-provided labels and descriptions.
- AI provider responses.
- Persisted values originally derived from external input.

## 3. Threat Model and Required Controls

| Threat | Potential impact | Required control |
|---|---|---|
| Broken object-level authorization | Access to another user's projects or reports | Ownership-scoped queries and cross-user authorization tests |
| Broken authentication | Account compromise | bcrypt hashing, signed expiring JWT, HttpOnly cookie, login rate limiting |
| CSRF | Unwanted cookie-authenticated state changes | SameSite cookie, strict Origin validation for unsafe methods, same-origin production model |
| XSS | Script execution through displayed data | React text rendering, no unsafe HTML rendering, safe handling of uploaded descriptions |
| NoSQL injection | Manipulated database queries | Zod allowlists and no direct spreading of raw request objects into MongoDB queries |
| Malicious or oversized uploads | Memory exhaustion or parser abuse | 1 MiB cap, content validation, bounded parsing and in-memory handling |
| YAML complexity or alias abuse | Excessive parsing work | YAML parser limits, alias restrictions, nesting and node-count bounds |
| Remote `$ref` SSRF | Requests to private or internal hosts | External references rejected; supported internal JSON Pointer references only |
| Test-runner SSRF | Requests to arbitrary network destinations | No arbitrary target URL; server-controlled bundled implementation |
| Resource exhaustion | CPU, memory, or execution saturation | Document, operation, finding, test-count, concurrency, timeout, and response-size limits |
| AI prompt injection or malformed output | Unsafe or irrelevant suggestions | Trusted synthetic context, structured output validation, operation matching, human approval |
| AI data exposure | Confidential specifications submitted to provider | Explicit consent, selected synthetic operation context, no secrets or production data |
| Secret leakage | API keys or JWTs exposed | Server-only environment variables, `.env` exclusion, redacted logs, secret rotation |
| Dependency compromise | Vulnerable or malicious dependency | Lockfiles, dependency review, vulnerability triage, maintained packages |
| Historical record tampering | Incorrect audit or regression evidence | Immutable specification versions, completed reports, and completed test-run snapshots |

The controls address security risks relevant to API applications, including broken object-level authorization, broken authentication, unrestricted resource consumption, SSRF, and unsafe consumption of external data.

Reference: [OWASP API Security Top 10](https://owasp.org/API-Security/)

## 4. Authentication Security

### 4.1 Password Storage

Passwords are hashed using bcrypt.

Requirements:

- Hash passwords before persistence.
- Use asynchronous hashing and verification functions.
- Use a suitable work factor for the deployment environment.
- Never store plaintext passwords.
- Never log submitted passwords or stored hashes.
- Never return `passwordHash` in normal API responses.
- Avoid exposing whether a specific account exists through authentication error messages.

### 4.2 JWT Authentication

JWTs are used for authenticated application requests.

Requirements:

- Signing secrets are stored server-side.
- Tokens must be signed and verified using the configured algorithm.
- Token expiration is enforced.
- Missing, malformed, invalid, or expired tokens are rejected.
- Authentication failures must not reveal token verification details.

The access token is transported through the `cg_access` cookie.

### 4.3 Cookie Security

Required cookie properties:

- `HttpOnly` enabled.
- `SameSite=Lax` or stricter where compatible with the application.
- `Secure` enabled in production.
- Consistent path and expiration settings.
- Cookie cleared using matching attributes during logout.

JWTs must not be stored in localStorage or sessionStorage.

The configured token lifetime must remain short and be enforced by the backend.

### 4.4 Authentication Rate Limiting

Registration and login endpoints must apply appropriate rate limits.

Rate-limit responses must not reveal credentials or internal account details.

## 5. Authorization and Ownership

ContractGuard uses an authenticated personal-project ownership model.

Every project belongs to one user.

Every child-resource operation must verify ownership through the parent project.

Required controls:

- Derive the authenticated user ID from the verified token.
- Scope project queries using the authenticated owner.
- Validate that specification versions belong to the selected project.
- Validate that comparison reports belong to the selected project.
- Validate that test cases belong to the report's baseline version.
- Validate that test runs belong to the selected report and project.
- Never accept client-supplied ownership as authoritative.
- Avoid disclosing whether another user's resource exists.

Authorization tests must cover attempts to read, modify, approve, archive, or delete resources owned by another user.

## 6. Request and Input Validation

The backend validates request bodies, route parameters, query parameters, and upload metadata.

Requirements:

- Use explicit request schemas.
- Validate ObjectIds before database access.
- Reject or deliberately strip unknown high-risk fields.
- Prevent mass assignment.
- Apply length and array-size limits.
- Validate resource relationships at the service layer.
- Avoid passing raw request objects directly into MongoDB queries or update operators.
- Keep server-derived fields outside client control.

Security-sensitive server-derived fields include:

- `ownerId`
- `contentHash`
- `runnerProfile`
- `rulesetVersion`
- `direction`
- `analysisStatus`
- Final test results.
- Execution target.
- Provider configuration.

## 7. Upload and Parser Security

### 7.1 Upload Restrictions

Accepted formats:

- JSON.
- YAML.

Maximum original specification size:

`1 MiB`

Requirements:

- Validate size before parsing.
- Inspect file content rather than trusting extensions alone.
- Parse in memory.
- Do not execute uploaded content.
- Do not write uploads to a durable deployment filesystem.
- Reject malformed documents.
- Preserve bounded parser diagnostics.
- Avoid rendering raw HTML from uploaded descriptions.

### 7.2 Parser Resource Limits

The backend applies limits to:

- Path entries.
- Operation count.
- Document depth.
- Parsed node count.
- Internal reference depth.
- Normalized representation size.
- Comparison finding count.

These limits prevent excessively large or complex documents from consuming unbounded resources.

### 7.3 Reference Resolution

- Only supported internal references may be resolved.
- External `$ref` URLs are rejected.
- The resolver must not make network requests.
- Cyclic and excessive-depth references must be detected.
- Unresolved references must produce explicit diagnostics.
- Unsupported relevant reference behavior must result in partial analysis.

### 7.4 OpenAPI Server Definitions

OpenAPI `servers` entries are specification data.

They are not execution instructions.

The backend and regression runner must never fetch uploaded server URLs.

## 8. Regression Runner Isolation

The regression runner is restricted to the bundled Demo Store implementation.

Required controls:

- No arbitrary target URL.
- No user-supplied hostname, IP address, or port.
- No client-controlled network destination.
- No execution against uploaded `servers` definitions.
- No arbitrary redirects to external hosts.
- GET operations only.
- Request construction from approved baseline operation definitions.
- Validated path and query parameters only.
- No arbitrary request headers.
- No user-provided authentication credentials.
- No executable scripts or shell commands.
- Candidate response validation against the baseline contract.

The runner uses a server-controlled in-process adapter for known bundled candidate handlers.

### 8.1 Execution Limits

The initial execution limits are:

| Resource | Limit |
|---|---:|
| Approved test cases per run | 20 |
| Concurrent test runs | 2 |
| Concurrent tests per run | 2 |
| Per-test timeout | 5 seconds |
| Total run deadline | 60 seconds |
| Maximum response body | 256 KiB |
| Stored evidence per result | 16 KiB |
| Validation diagnostics per result | 50 |

These limits must be enforced server-side.

A timeout or unsupported response-validation condition must not be represented as a successful test.

### 8.2 Historical Integrity

Test-run results preserve the comparison, specification versions, test-case snapshots, and result evidence used during execution.

Updating or archiving a test case must not rewrite completed historical results.

Unfinished runs must not silently appear successful after a process restart.

## 9. AI Privacy and Safety

### 9.1 Provider

The optional integration uses Google's Gemini Developer API through the official `@google/genai` JavaScript SDK.

The Gemini API key is configured and accessed on the backend only.

### 9.2 Eligible Context

The AI integration is limited to trusted synthetic Demo Store context.

Currently supported operations:

- `listProducts` — GET `/products`
- `getProduct` — GET `/products/{productId}`

The backend constructs the provider context from the trusted fixture registry.

The client cannot provide arbitrary prompts or substitute an unrelated operation.

### 9.3 Consent

Before provider submission:

1. The selected operation is validated.
2. The backend builds a sanitized context.
3. The frontend displays the provider-submission preview.
4. The user explicitly consents.
5. The backend revalidates the request before calling Gemini.

No provider request occurs without explicit consent.

### 9.4 Data Restrictions

Do not submit:

- Production API specifications.
- Customer or personal information.
- Production request or response payloads.
- Credentials.
- Authentication headers.
- API keys.
- Confidential business information.
- Private project documents.

Only the bounded synthetic context required for the selected operation may be submitted.

### 9.5 Provider Terms

Google's Gemini Developer API free-tier terms may allow submitted content to be used to improve Google's products.

Provider terms, data-use policies, quotas, and model availability may change.

The application must not assume that free-tier provider submissions are confidential.

References:

- [Gemini API documentation](https://ai.google.dev/gemini-api/docs)
- [Gemini API pricing and data-use information](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API terms](https://ai.google.dev/gemini-api/terms)

### 9.6 AI Output Validation

AI output is untrusted data.

Requirements:

- Validate the structured output using the backend schema.
- Validate the selected operation association.
- Validate request parameters and assertions.
- Reject unknown or unsupported fields.
- Reject malformed or oversized responses.
- Persist valid suggestions as drafts.
- Require human approval before execution.
- Never execute generated code.
- Never allow AI output to choose an execution target.

### 9.7 AI Rate Limiting

AI generation requests are rate-limited per authenticated user.

The current middleware uses a limit of three generation requests per hour.

Provider quota exhaustion and request rate limiting must be communicated separately from deterministic compatibility or regression failures.

AI failure must not disable core product functionality.

## 10. Operational Security

The application uses security middleware and deployment configuration to reduce common application risks.

Requirements include:

- Helmet security headers.
- Configured CORS allowlist during development.
- Same-origin API deployment in production.
- Strict Origin validation for unsafe methods.
- Request-body size limits.
- Authentication rate limits.
- AI endpoint rate limits.
- Server-only environment secrets.
- `.env` exclusion from version control.
- Redaction of authorization headers, cookies, API keys, and sensitive values in logs.
- Safe production error responses.
- Dependency review before releases.
- Secret rotation after suspected exposure.

Production error responses must not expose stack traces, MongoDB queries, provider credentials, or internal filesystem paths.

## 11. Reliability Controls

- MongoDB connection failure must be surfaced through safe readiness and health information.
- Database writes must complete before the application reports successful persistence.
- Specification versions are immutable after creation.
- Completed comparison findings are immutable.
- Completed test-run evidence is immutable.
- AI requests use bounded execution and output size.
- Parser and regression limits are enforced server-side.
- Incomplete runs are marked `INTERRUPTED` when safely recovered after a process restart.
- Provider failures do not affect deterministic product capabilities.

## 12. Verification Status

The following engineering evidence has been recorded:

| Area | Recorded evidence |
|---|---|
| Authentication | Automated authentication and password-hashing tests |
| Ownership | Project and resource ownership integration coverage |
| Specification validation | Parser, upload, and validation test coverage |
| Compatibility | Deterministic analyzer and report-contract tests |
| Test management | Test-case lifecycle and validation coverage |
| AI consent | Preview, authentication, consent, and missing-configuration route tests |
| AI output | Structured output and operation-validation tests |
| Frontend | ESLint and production build passed in the recorded verification run |

This evidence does not replace a full security acceptance review.

## 13. Security Verification Checklist

Before a public production release, verify:

- [ ] No secrets exist in source files, Git history, or frontend build output.
- [ ] Production JWT cookie flags are correct.
- [ ] Unsafe requests enforce Origin validation.
- [ ] Authentication endpoints are rate-limited.
- [ ] Every resource route enforces project ownership.
- [ ] Invalid and oversized files are rejected.
- [ ] YAML complexity and alias restrictions are enforced.
- [ ] External `$ref` requests are prevented.
- [ ] Uploaded server URLs are never fetched.
- [ ] Arbitrary regression targets are impossible.
- [ ] Only approved eligible GET tests execute.
- [ ] Test-run count and timeout limits are enforced.
- [ ] AI preview and consent are enforced.
- [ ] Only trusted synthetic context reaches the provider.
- [ ] AI output cannot execute code or select a target URL.
- [ ] Error responses and logs do not expose secrets.
- [ ] Dependency vulnerabilities have been reviewed.
- [ ] Production environment configuration has been checked.
- [ ] Deployment persistence and restart behavior have been tested.

## 14. Review Status

The security controls in this document define the intended protection model and release requirements.

Automated tests demonstrate selected controls, but the application has not been independently penetration-tested or security-certified.

A public production release requires completion and documentation of the remaining security verification checklist.