
# Security Review and Threat Model

**Product:** ContractGuard  
**Document version:** 1.1  
**Security baseline:** V1 implementation requirements  
**Status:** Revised for implementation

## 1. Purpose

This document identifies the principal security risks in ContractGuard and defines the controls required for its initial release.

ContractGuard processes user-uploaded API specifications, persists parsed documents and analysis results, manages authenticated user resources, and executes bounded regression tests against a bundled demonstration API.

These functions introduce risks involving:

- Malicious or malformed uploaded documents.
- Resource exhaustion during parsing and comparison.
- Unauthorized access to user-owned resources.
- Cross-site request forgery.
- Cross-site scripting.
- Server-side request forgery.
- Unsafe test execution.
- Database injection and mass assignment.
- Authentication and password storage.
- Exposure of sensitive information to external AI providers.
- Abuse of public endpoints and resource-intensive operations.
- Information leakage through logs, error messages, and stored evidence.

The purpose of the v1 security design is to reduce these risks using a small, understandable set of controls.

ContractGuard is a portfolio application, not a certified security product. Passing its security tests does not establish that it is free of vulnerabilities.

## 2. Security objectives

1. Prevent users from accessing resources belonging to other users.
2. Treat every uploaded specification and every field within it as untrusted input.
3. Prevent arbitrary network access through specification parsing or test execution.
4. Prevent arbitrary code execution through uploaded documents or AI output.
5. Bound memory, CPU, storage, parsing depth, reference resolution, and execution time.
6. Protect authentication credentials and password hashes.
7. Prevent unauthorized cross-site state changes.
8. Prevent untrusted content from becoming executable browser markup.
9. Minimize external data disclosure.
10. Preserve the integrity of comparison results, approved tests, and historical execution evidence.
11. Return safe errors without exposing internal implementation details.
12. Make important security decisions explicit, documented, and testable.

## 3. Assets and trust boundaries

### 3.1 Assets

| Asset | Security concern |
|---|---|
| User accounts | Unauthorized account access |
| Password hashes | Offline password cracking |
| JWT authentication cookies | Session theft or misuse |
| Project records | Cross-user data access |
| Uploaded specification text | Malicious or oversized input |
| Parsed OpenAPI documents | Parser exploitation and resource exhaustion |
| Specification versions | Historical integrity and unauthorized modification |
| Comparison reports | Integrity of compatibility findings |
| Test cases | Unauthorized execution or modification |
| Regression-run evidence | Integrity and confidentiality |
| AI API key | Unauthorized provider usage |
| Application secrets | Authentication or database compromise |
| MongoDB data | Unauthorized reads, modifications, or deletion |
| Application logs | Accidental disclosure of secrets and personal information |

### 3.2 Trust boundaries

ContractGuard has the following trust boundaries:

**Boundary A: Browser → Express API**

The browser is untrusted. Authentication, authorization, request validation, CSRF protection, and all business rules must be enforced by the server.

**Boundary B: Uploaded document → Parser**

An uploaded JSON/YAML document is untrusted, even when it is syntactically valid.

The parser must operate within documented resource limits and must not fetch external resources.

**Boundary C: Parsed specification → Compatibility engine**

Parsed data is still untrusted. The engine must consume a validated, normalized internal representation rather than directly trusting arbitrary properties or unsupported constructs.

**Boundary D: Application → Regression runner**

The runner must receive only approved test cases, server-controlled fixture identifiers, bounded input values, and validated operation definitions.

**Boundary E: Application → AI provider**

Any data sent to an external AI provider leaves the application's trust boundary.

Only explicitly permitted synthetic demonstration context may be sent to an unpaid provider after user consent.

**Boundary F: Express API → MongoDB**

Database queries must be scoped to authenticated ownership. Client-supplied objects must not be passed directly into database filters or update operations.

## 4. Authentication and password security

### 4.1 Password storage

Passwords must never be stored in plaintext or reversibly encrypted.

Use Argon2id for password hashing.

Initial configuration:

- Memory cost: 19 MiB or higher.
- Iterations: 2 or higher.
- Parallelism: 1 or higher.

These are minimum implementation parameters, not a permanent optimal configuration. Benchmark the chosen configuration on the actual deployment environment and increase the cost where practical.

Additional controls:

- Use a unique salt for every password hash.
- Use a maintained Argon2 implementation.
- Never log passwords or password hashes.
- Never return password hashes from API responses.
- Apply request-size and login-rate limits.
- Compare passwords through the password-hashing library's verification function.
- Do not implement custom password hashing.
- Do not use fast general-purpose hashes such as SHA-256 directly for password storage.

Password input requirements:

- Enforce a reasonable minimum password length.
- Enforce an application-level maximum length to bound processing.
- Preserve the password exactly as supplied; do not silently trim or alter it.
- Reject empty or malformed password values.
- Avoid unnecessary complexity rules that encourage predictable passwords.

### 4.2 JWT authentication

Authentication uses a signed JWT stored in an HttpOnly cookie.

Requirements:

- Use a strong, randomly generated signing secret.
- Load the secret from the environment.
- Never commit the secret to Git.
- Validate the signature, expiration, issuer, and audience.
- Explicitly allow the configured signing algorithm.
- Reject unsigned tokens and unexpected algorithms.
- Keep claims minimal.
- Use `sub` to identify the user.
- Never accept JWTs from query parameters or request bodies.
- Never expose the token through normal API responses.
- Do not log tokens.

The access-token lifetime must be short and explicitly configured.

V1 does not introduce a refresh-token database, token blacklist, or distributed session-management system.

Logout clears the browser's authentication cookie. Because a stateless JWT is not individually revoked in v1, a copied token may remain valid until expiration. This residual risk must be documented and considered when choosing the access-token lifetime.

### 4.3 Cookie configuration

Production authentication cookie:

- `HttpOnly: true`
- `Secure: true`
- `SameSite: Lax`
- `Path: /`
- No unnecessary `Domain` attribute.
- Explicit expiration.

For local HTTP development, the Secure setting may be disabled only through the development environment configuration.

Cookie settings must be consistent when issuing and clearing the cookie.

Browser JavaScript must never read the authentication cookie.

## 5. Authorization and ownership

Authentication alone does not establish permission to access a resource.

Every protected project and child-resource operation must verify ownership.

Requirements:

- Derive the user ID from the verified JWT.
- Never accept `ownerId` as an authorization source from the browser.
- Query projects using both project ID and authenticated owner ID.
- Verify the parent project before accessing its specifications.
- Verify project ownership before retrieving comparisons, test cases, and test runs.
- Verify that baseline and candidate specification versions belong to the same project.
- Verify that selected test cases belong to the comparison's baseline version.
- Verify that the test cases are approved before execution.
- Reject attempts to change historical comparison or test-run ownership references.

A user must not gain access simply by knowing or guessing another resource's MongoDB ObjectId.

For inaccessible or nonexistent resources, prefer a consistent `404` response where that avoids revealing whether another user's resource exists.

Automated tests must attempt cross-user access to every major resource type.

## 6. Cross-site request forgery (CSRF)

Cookie-based authentication requires CSRF protection.

SameSite cookies are a defense-in-depth measure, not the only security control.

V1 uses exact source-origin verification for unsafe browser requests.

Unsafe methods:

- POST
- PUT
- PATCH
- DELETE

Required behavior:

1. Compare the request Origin against the configured application origin.
2. Perform an exact origin comparison; never use unsafe substring matching.
3. If Origin is absent, validate the Referer origin against the configured application origin.
4. Reject `Origin: null`.
5. Reject a request when neither header establishes a trusted source origin.
6. Do not derive an allowed origin from an untrusted forwarded header.
7. Trust proxy metadata only when the deployment proxy is explicitly configured and strips or overwrites client-supplied forwarding headers.
8. Do not perform state-changing actions through GET or other safe methods.

The check applies to relevant unauthenticated state-changing endpoints as well, including registration and login.

If future deployment requirements prevent reliable Origin/Referer validation, introduce a properly validated synchronizer-token or signed double-submit-token mechanism before relaxing the rejection behavior.

Do not silently bypass CSRF checks for requests with missing or null origin information.

Reference: OWASP Cross-Site Request Forgery Prevention Cheat Sheet.

## 7. Cross-origin policy and browser security headers

The intended deployment uses a same-origin browser architecture:

- Vite proxies `/api` to Express in development.
- Express serves the built React application and API from the same origin in production.

CORS should therefore not be enabled globally by default.

If a separate frontend origin is introduced later, configure a strict explicit origin allowlist and credentials behavior. Never reflect arbitrary Origin values or use wildcard origins with credentialed requests.

Use maintained security-header middleware such as Helmet.

At minimum, configure and review:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- A restrictive Content Security Policy
- `frame-ancestors` protection against framing
- `Strict-Transport-Security` for HTTPS production deployments
- Appropriate permissions policy

Content Security Policy must be tested against the production React build rather than copied blindly from a generic template.

Do not expose unnecessary browser features or third-party scripts.

## 8. OpenAPI upload security

Uploaded specification documents are untrusted files.

The upload endpoint accepts JSON and YAML only.

### 8.1 Upload limits

Initial limits:

- Maximum original file size: 1 MiB.
- Only accepted JSON or YAML content.
- Maximum operation count: configured and enforced.
- Maximum document nesting depth: configured and enforced.
- Maximum parsed node count: configured and enforced.
- Maximum internal-reference resolution depth: configured and enforced.
- No external-reference fetching.
- No unrestricted recursive expansion.

These limits must be centralized in application configuration and applied consistently.

### 8.2 File validation

Do not rely only on:

- File extensions.
- Browser-provided MIME types.
- Multipart metadata.
- User-supplied filenames.

The server must:

1. Enforce the upload byte limit before parsing.
2. Inspect the accepted filename extension and reject unexpected formats.
3. Validate the actual document using the appropriate JSON or YAML parser.
4. Reject malformed or unsupported documents.
5. Reject unsupported custom tags and unsafe parsing behavior.
6. Calculate the SHA-256 hash from the original uploaded bytes.
7. Store only the bounded original text and derived data required by the product.
8. Avoid using the original filename as a filesystem path.

The implementation should use memory-based upload handling for the small, explicitly bounded file size. It must not allow uploaded filenames to select server filesystem locations.

### 8.3 YAML parser controls

YAML parsing must be configured deliberately.

Requirements:

- Use a maintained YAML parser.
- Use safe parsing behavior.
- Disallow YAML aliases in v1.
- Configure the parser with `maxAliasCount: 0` where supported.
- Reject unsupported custom tags.
- Detect duplicate mapping keys.
- Enforce post-parse depth and node-count limits.
- Reject malformed or excessively complex documents.

The application must not deserialize YAML into executable JavaScript objects or run any parsed document content as code.

YAML anchors and aliases are deliberately excluded from the v1 supported document subset.

### 8.4 OpenAPI reference handling

- Resolve internal document references only.
- Disable external `$ref` resolution.
- Never fetch a URL found in a document.
- Detect cycles and excessive reference depth.
- Bound reference expansion.
- Preserve the original source location for diagnostics.
- Report unresolved or unsupported relevant references as unsupported analysis.

An uploaded document must never cause the server to contact:

- Its declared `servers` URLs.
- External schema URLs.
- Remote file URLs.
- Arbitrary hostnames or IP addresses.

## 9. SSRF prevention and regression-runner isolation

This is a strict v1 security boundary.

ContractGuard must not act as a general-purpose API proxy.

The regression runner executes only against the bundled Demo Store candidate implementation.

### 9.1 Permitted execution model

The server selects a known fixture profile based on validated specification metadata and server-side fixture recognition.

The client cannot select or override:

- Target URL.
- Target hostname.
- Target IP address.
- Network port.
- Proxy configuration.
- Redirect destination.
- Arbitrary HTTP method.
- Arbitrary authentication credentials.
- Arbitrary request headers.
- Implementation version.

The preferred implementation is a server-controlled in-process demo adapter that invokes the bundled candidate handlers directly using validated operation definitions.

This avoids turning the application into an unrestricted HTTP client.

If a local HTTP adapter is introduced, it must use a fixed server-owned origin, disable redirects, validate every route against the bundled implementation, and enforce network restrictions. It must never derive its destination from user-supplied input.

### 9.2 Runner input controls

- Execute GET operations only in v1.
- Execute approved test cases only.
- Accept bounded path and query parameters.
- Construct request paths from validated OpenAPI operation definitions.
- Encode path and query values using appropriate URL encoding.
- Reject unsupported serialization styles.
- Do not concatenate arbitrary user-provided URLs.
- Do not accept executable scripts.
- Do not accept arbitrary request headers.
- Do not allow user-supplied authentication or cookie values.
- Do not read secrets from the server environment into test requests.

### 9.3 Execution limits

Enforce:

- Maximum 20 approved test cases per run.
- Maximum two concurrent runs.
- Five-second maximum per-test execution duration.
- Sixty-second total run deadline, including setup and result persistence where practical.
- Maximum response-body size.
- Maximum validation-error count and message size.
- Maximum total evidence stored per run.
- Rate limits on run creation.

The runner must distinguish:

- Actual assertion or response-schema failure.
- Unsupported operation or construct.
- Execution error.
- Timeout.
- Interrupted run.

Unsupported or interrupted execution must not silently become a passing result.

## 10. MongoDB and data-integrity controls

### 10.1 Query safety

- Validate ObjectIds before database access.
- Validate and normalize query inputs.
- Never pass arbitrary `req.query` or `req.body` objects directly as MongoDB filters.
- Build filters from allowlisted fields.
- Never accept client-supplied MongoDB operators.
- Use explicit update fields.
- Do not spread untrusted objects directly into Mongoose updates.
- Validate enum and status transitions.
- Enforce ownership in database queries, not only in route middleware.

### 10.2 Mass assignment

Only explicitly permitted fields may be changed.

For example, a project update may change:

- `name`
- `description`

It must not permit arbitrary changes to:

- `ownerId`
- `_id`
- `createdAt`
- `deletedAt`
- `projectId`
- `contentHash`
- `runnerProfile`
- `analysisStatus`
- `rulesetVersion`
- `testRun.status`
- `testRun.results`

Server-derived values must remain under server control.

### 10.3 Historical integrity

- Specification-version source content is immutable.
- Completed comparison findings are immutable.
- Completed test-run results are immutable.
- Approved test cases must not be silently rewritten after execution.
- A test run preserves its comparison, version IDs, ruleset ID, and selected test-case snapshots.
- A newer comparison must not rewrite an older report.

Use controlled update operations and validate status transitions.

## 11. AI provider privacy and prompt security

AI is an optional external integration.

The default application must work without an AI provider key.

### 11.1 Data-sharing restriction

The unpaid Gemini API tier may use submitted prompts and generated responses to improve Google products and services. Human reviewers may also review submitted inputs and outputs.

Therefore, the free-tier integration must be restricted to bundled synthetic Demo Store fixtures.

Never send:

- Arbitrary user-uploaded API specifications.
- Production API contracts.
- Customer data.
- Personal data.
- Passwords or authentication tokens.
- API keys or credentials.
- Production request/response bodies.
- Confidential business or implementation information.

This restriction applies even when the user believes that a specification has been sanitized.

### 11.2 Consent and transparency

Before an AI request:

1. Identify the operation being analyzed.
2. Display the exact sanitized context that will be shared.
3. Explain that the context will be sent to an external AI provider.
4. Explain the unpaid provider's applicable data-use terms.
5. Require explicit consent.
6. Send only the approved bounded context.

Consent must be obtained for the relevant provider submission. It must not be assumed merely because a user enabled an AI setting earlier.

### 11.3 Prompt-injection handling

Descriptions, examples, schema names, and other content from an API specification are untrusted data.

An API description might contain instructions that attempt to manipulate the AI model.

The prompt must clearly distinguish system instructions from specification data.

Requirements:

- Treat specification text as data, never as authority over system instructions.
- Do not follow instructions embedded in descriptions or examples.
- Ask for structured test suggestions only.
- Never request executable JavaScript, shell commands, or arbitrary network instructions.
- Limit prompt input and expected output size.
- Use a strict output schema.
- Validate the provider response with Zod.
- Validate every suggested operation against the selected fixture.
- Reject unknown fields and unsupported values.
- Store accepted suggestions as `DRAFT`.
- Require user review and approval before execution.

Model output is untrusted, even when it is syntactically valid JSON.

### 11.4 AI provider credentials and failure handling

- Keep the provider API key exclusively on the backend.
- Read it from an environment variable.
- Never expose it through frontend build variables.
- Never return it through any API response.
- Never write it to logs.
- Apply provider request timeouts and rate limits.
- Handle quota exhaustion and provider errors gracefully.
- Do not implement a paid provider fallback.
- Do not make core compatibility functionality depend on AI availability.

### 11.5 AI logging

Do not log full prompts, full provider responses, uploaded specifications, or user-provided confidential content.

Safe metadata may include:

- Provider identifier.
- Model identifier.
- Request timestamp.
- Request outcome.
- Duration.
- Token usage when safely available.
- Validation outcome.

## 12. Frontend security and XSS prevention

Specification content, descriptions, summaries, server names, schema examples, and AI suggestions must be treated as untrusted text.

Requirements:

- Use React's default text escaping.
- Do not insert untrusted specification content through `dangerouslySetInnerHTML`.
- Do not execute uploaded HTML, JavaScript, or Markdown as browser code.
- Do not load arbitrary external images or URLs from specification metadata.
- Do not turn untrusted server URLs into automatic network requests.
- Avoid unsafe HTML rendering of AI output.
- Use controlled code/JSON viewers that display content as text.
- Validate all frontend navigation targets.
- Keep authentication tokens out of `localStorage` and `sessionStorage`.

Any future Markdown rendering feature must use a maintained sanitizer and a restrictive rendering policy.

## 13. Rate limiting and denial-of-service controls

Apply rate limits by authenticated user and/or source IP as appropriate.

Higher-risk endpoints:

- Registration.
- Login.
- Specification upload.
- Comparison creation.
- Test-run creation.
- AI suggestion generation.

Apply additional controls:

- Bounded request-body sizes.
- Bounded upload sizes.
- Bounded pagination.
- Bounded string and array lengths.
- Bounded parser depth and node count.
- Bounded operation and schema counts.
- Bounded reference resolution.
- Bounded AI prompt and output sizes.
- Bounded execution concurrency.
- Per-case and per-run execution deadlines.

Do not allow unlimited comparison creation or repeated expensive AI calls.

Rate-limit responses should be predictable and must not disclose sensitive account information.

## 14. Logging, errors, and observability

Logs should help debug failures without storing secrets or unnecessary user data.

Permitted log metadata may include:

- Timestamp.
- Request ID.
- Route and HTTP method.
- Response status.
- Duration.
- Authenticated internal user ID where appropriate.
- Safe resource ID.
- Error code.
- Execution result category.

Never log:

- Passwords.
- Password hashes.
- JWTs or cookies.
- Database connection strings.
- AI provider API keys.
- Uploaded raw specification content.
- Confidential prompts or model responses.
- Arbitrary request or response bodies.
- Authentication headers.

Production API responses must not include:

- Stack traces.
- Internal file paths.
- MongoDB connection information.
- Raw driver errors.
- Provider credentials.
- Environment variable values.

Use consistent request IDs to correlate a request with its safe server-side logs.

## 15. Secrets and configuration management

The following values must be provided through environment configuration:

- MongoDB connection string.
- JWT signing secret.
- Application origin.
- Optional Gemini API key.
- Other deployment-specific secrets where required.

Requirements:

- `.env` must be ignored by Git.
- `.env.example` contains names and safe placeholders only.
- Never commit actual credentials.
- Never expose secrets through `VITE_` frontend environment variables.
- Use separate secrets for development and deployment.
- Rotate compromised secrets.
- Restrict access to deployment configuration.
- Avoid printing the environment at application startup.

A missing optional AI key must disable AI without preventing the application from starting.

A missing required database or authentication secret must cause a clear startup failure.

## 16. Dependency and deployment security

- Use official package registries.
- Commit the package lockfile.
- Review new dependencies before adding them.
- Avoid unnecessary dependencies.
- Keep Node.js and dependencies on supported versions.
- Apply security updates deliberately.
- Review `npm audit` findings and distinguish exploitable production issues from development-only findings.
- Use maintained packages for authentication, parsing, and validation.
- Do not install packages through unverified scripts.
- Restrict access to production environment variables.
- Use HTTPS in production.
- Do not expose the MongoDB database publicly.
- Use least-privilege database credentials.
- Configure database network access deliberately.
- Ensure temporary storage and uploaded content are not treated as executable content.

For a public deployment, rate limits and security controls must be applied at the application level rather than assuming that free hosting infrastructure will provide all required protection.

## 17. Security test plan

The following test groups are required before v1 release.

### 17.1 Authentication tests

- Registration with valid input.
- Registration with duplicate email.
- Login with correct credentials.
- Login with incorrect credentials.
- Expired JWT rejection.
- Invalid JWT signature rejection.
- Unexpected JWT algorithm rejection.
- Logout cookie clearing.
- Password hash never returned in API responses.

### 17.2 Authorization tests

- User A cannot read User B's project.
- User A cannot update User B's project.
- User A cannot access User B's specification.
- User A cannot retrieve User B's comparison.
- User A cannot read User B's test cases.
- User A cannot retrieve User B's test-run results.
- Cross-project baseline/candidate comparison is rejected.
- Test cases from another baseline version are rejected during run creation.

### 17.3 CSRF tests

- Unsafe request with trusted Origin succeeds when otherwise valid.
- Unsafe request with untrusted Origin is rejected.
- Unsafe request with `Origin: null` is rejected.
- Unsafe request with a valid Referer fallback succeeds when Origin is absent.
- Unsafe request with neither trusted Origin nor Referer is rejected.
- GET endpoints do not change application state.

### 17.4 Upload and parser tests

- Valid JSON OpenAPI upload.
- Valid YAML OpenAPI upload.
- Invalid JSON rejection.
- Invalid YAML rejection.
- Unsupported extension rejection.
- Oversized document rejection.
- Duplicate YAML key rejection.
- YAML aliases rejected.
- Unsupported custom tags rejected.
- Excessive nesting rejected.
- Excessive node count rejected.
- External `$ref` never fetched.
- Cyclic references handled with a bounded diagnostic.
- Unresolved internal references reported.
- File content is never executed.

### 17.5 SSRF and execution tests

- Specification `servers` URLs do not trigger network requests.
- External `$ref` URLs do not trigger network requests.
- User-supplied hostnames are rejected.
- User-supplied IP addresses are rejected.
- Redirect-based execution is unavailable.
- Only approved GET operations execute.
- Unapproved test cases are rejected.
- More than 20 selected test cases are rejected.
- Execution timeouts are enforced.
- Candidate responses are validated against baseline schemas.
- Unsupported operations never produce a passing result.
- Test-run evidence is bounded and sanitized.

### 17.6 Database and input tests

- Malformed ObjectIds rejected.
- MongoDB operator injection payloads rejected or treated as ordinary invalid input.
- Mass-assignment attempts do not modify protected fields.
- Pagination and query limits enforced.
- Cross-project resource relationships rejected.
- Completed comparison reports cannot be modified through normal API routes.
- Completed test-run results cannot be modified through normal API routes.

### 17.7 AI tests

- AI disabled without credentials.
- AI unavailable when provider quota is exhausted.
- AI request without consent is rejected.
- Arbitrary user-uploaded specifications cannot be sent to the unpaid provider.
- Only recognized bundled synthetic fixtures are eligible.
- Prompt-injection text in descriptions is treated as untrusted data.
- Malformed provider JSON is rejected.
- Unexpected AI output fields are rejected.
- AI-generated executable code is never stored or executed.
- AI suggestions begin in `DRAFT`.
- Draft suggestions cannot be selected for a test run.
- Provider keys never appear in responses or logs.

### 17.8 Frontend tests

- Untrusted description strings render as text.
- HTML-like specification content does not execute.
- JavaScript-like examples do not execute.
- Untrusted AI output does not become HTML.
- Authentication tokens are not stored in browser web storage.
- Keyboard navigation and visible focus remain usable.

## 18. Residual risks and v1 limitations

The controls above reduce risk but do not eliminate it.

Known limitations:

- V1 has a simple personal-account model rather than a mature session-management system.
- A stateless JWT cannot be individually revoked before expiration without additional infrastructure.
- Browser security depends partly on correct production origin and proxy configuration.
- Parser vulnerabilities may still exist in third-party dependencies.
- Free AI-provider terms and quotas may change.
- A compromised deployment environment can expose application secrets and data.
- The bounded regression runner proves behavior only against the bundled demonstration implementation, not arbitrary production deployments.
- Compatibility rules cover only the documented supported schema subset.
- Historical reports preserve evidence but are not cryptographically signed.
- Free hosting services may have limitations in availability, persistence, and network controls.

The v1 application must describe these limitations honestly.

Do not claim that ContractGuard is immune to SSRF, XSS, injection, data leakage, or every other class of attack.

## 19. Security acceptance criteria

Before the first public demonstration:

1. All required authentication and ownership tests pass.
2. Cookie and CSRF behavior is verified in the actual deployment topology.
3. File-size and parser resource limits are enforced server-side.
4. YAML aliases and external reference fetching are disabled.
5. No user-controlled target URL can reach the runner.
6. Only approved bounded requests execute against the bundled candidate implementation.
7. AI requests are restricted to synthetic fixtures and require explicit consent.
8. AI output is validated and never executed.
9. No authentication secrets or provider keys appear in frontend bundles, API responses, or logs.
10. The application uses HTTPS in production.
11. Production dependencies are reviewed and known actionable vulnerabilities are addressed.
12. Security tests are included in the automated test suite.
13. Residual limitations are documented in the project README.

## 20. Security reference material

The implementation should follow current official security guidance and revisit these sources when the relevant components are implemented.

- OWASP Password Storage Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

- OWASP Cross-Site Request Forgery Prevention Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

- OWASP File Upload Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

- OWASP Server-Side Request Forgery Prevention Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

- OWASP Input Validation Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

- Google Gemini API Additional Terms of Service:
  https://ai.google.dev/gemini-api/terms

Recheck provider terms, model availability, quotas, and applicable security guidance when implementing the relevant integration.
