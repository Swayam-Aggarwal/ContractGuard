# Product Design and UI Specification

**Product:** ContractGuard\
**Document version:** 1.2\
**Design direction:** Precision Workbench\
**Document status:** Interface and interaction specification\
**Last updated:** 14 November 2026

---

## 1. Design Objective

ContractGuard is a developer-focused engineering workbench. Its interface should communicate precision, traceability, and clarity when presenting complex API contract information.

The primary experience is a technical workspace for exploring specifications, reviewing compatibility findings, understanding test coverage, and inspecting regression results.

The interface should avoid the appearance of a generic administration dashboard. Information architecture, data presentation, and interaction clarity take priority over decorative elements.

The design should help users answer three questions quickly:

1. What changed in the API contract?
2. Which operations and test cases may be affected?
3. What evidence is available to assess the change?

## 2. Design Principles

### 2.1 Evidence Before Decoration

Present the changed contract element, source location, previous value, candidate value, compatibility rule, and rationale before decorative summaries.

### 2.2 Clear Information Hierarchy

Every screen should establish:

- A clear page title.
- Relevant project and specification context.
- One primary action.
- Secondary actions with less visual emphasis.
- Readable technical details.

### 2.3 Progressive Disclosure

Show essential information by default. Allow users to expand advanced schema structures, validation details, and execution evidence without overwhelming the primary workflow.

### 2.4 Honest Status Communication

The interface must distinguish confirmed breaking findings, potentially breaking findings, unsupported analysis, and successful regression execution.

A partial analysis must never be presented as a fully verified compatibility result.

### 2.5 Consistent Terminology

Use the same domain language throughout the application:

- Baseline specification.
- Candidate specification.
- Compatibility finding.
- Affected operation.
- Test case.
- Test coverage.
- Regression run.
- Test result.
- AI-generated draft.

### 2.6 Accessible Interaction

Color must never be the only way to communicate severity or execution status. Primary actions, dialogs, navigation, and tables must be keyboard-accessible.

## 3. Visual Identity

### 3.1 Visual Direction: Precision Workbench

The visual direction uses:

- A neutral light workspace.
- A deep graphite navigation shell.
- Indigo as the primary interaction accent.
- Restrained semantic colors for technical statuses.
- Thin borders and subtle surface differentiation.
- Monospaced typography for paths, JSON, schemas, and code-like values.
- Consistent spacing and alignment.

Avoid:

- Decorative gradients.
- Glassmorphism.
- Excessive shadows.
- Unnecessary animations.
- Oversized dashboard cards.
- Decorative charts without meaningful data.
- Excessive rounded containers.

### 3.2 Color Tokens

The following tokens define the intended visual palette.

| Token | Value | Usage |
|---|---|---|
| `--cg-shell` | `#151922` | Navigation shell |
| `--cg-shell-muted` | `#202633` | Sidebar hover and active surfaces |
| `--cg-canvas` | `#F5F7FA` | Main application background |
| `--cg-surface` | `#FFFFFF` | Panels and menus |
| `--cg-surface-subtle` | `#F8FAFC` | Secondary panel backgrounds |
| `--cg-border` | `#E2E8F0` | Dividers and outlines |
| `--cg-text` | `#172033` | Primary text |
| `--cg-text-muted` | `#64748B` | Secondary text |
| `--cg-primary` | `#4F46E5` | Primary actions and selected navigation |
| `--cg-danger` | `#C2414B` | Breaking findings and errors |
| `--cg-warning` | `#B7791F` | Potentially breaking findings and cautions |
| `--cg-success` | `#16805D` | Passed results and non-breaking findings |
| `--cg-info` | `#2563EB` | Informational states |

The actual foreground/background combinations must be checked for sufficient contrast.

Semantic statuses must include readable labels or accessible icons in addition to color.

### 3.3 Typography

**Primary interface typography**

- Inter or a compatible system sans-serif fallback.

**Technical typography**

- `ui-monospace`
- SFMono-Regular
- Consolas
- Generic monospace fallback

| Element | Recommended size |
|---|---:|
| Page heading | 24–28 px |
| Section heading | 16–18 px |
| Body text | 14 px |
| Supporting text | 13–14 px |
| Metadata | 12–13 px |
| Code and schema values | 12–13 px |

Long operation paths and schema values must wrap safely or provide copy controls.

### 3.4 Spacing and Shape

Use a 4 px spacing scale.

Common spacing values:

- 8 px
- 12 px
- 16 px
- 20 px
- 24 px
- 32 px

Suggested radii:

- Panels: 8–12 px.
- Buttons: 6–8 px.
- Inputs: 6–8 px.
- Small status indicators: compact and consistent.

Use borders to establish structure. Shadows should primarily be reserved for overlays and floating elements.

## 4. Application Shell

### 4.1 Desktop Layout

The desktop application uses:

- A persistent left navigation area.
- A main content workspace.
- A top bar containing contextual navigation and account controls.
- Consistent page padding.
- Flexible content areas that accommodate technical tables and comparison panels.

The navigation shell should remain visually distinct from the workspace without competing with the content.

### 4.2 Primary Navigation

The authenticated workspace provides navigation for:

- Projects.
- API specifications.
- Comparisons.
- Test cases.
- Test runs.

Project and comparison context should remain visible when moving between related views.

Navigation elements must correspond to available application functionality. Unimplemented features must not be presented as active capabilities.

### 4.3 Page Header

A standard page header may contain:

- Breadcrumbs.
- Page title.
- Short contextual description.
- Relevant project or version context.
- Primary action.
- Secondary actions.

The header should not consume excessive vertical space.

## 5. Screen Specifications

### 5.1 Authentication

The authentication interface provides registration and login.

Required elements:

- Clearly labelled form fields.
- Password visibility control where available.
- Field-level validation.
- Generic authentication errors.
- Pending submission state.
- Navigation between registration and login.

Password values must not be displayed in logs or persisted in browser storage.

### 5.2 Projects Workspace

**Purpose:** Provide an entry point to personal API projects and recent engineering activity.

Required elements:

- Page title.
- Primary `Create Project` action.
- Project list or table.
- Project name.
- Description where available.
- Last updated timestamp.
- Specification and comparison context.
- Empty state for users without projects.

Avoid meaningless summary metrics or placeholder activity.

### 5.3 Project Overview

The project overview establishes the context for all related specifications and comparisons.

Required elements:

- Project name and description.
- Specification version history.
- Recent comparison activity.
- Recent regression runs.
- Upload specification action.
- Compare versions action.

For a new project, the interface should guide the user toward uploading an initial specification.

### 5.4 Specification Upload

The upload interface should communicate:

- Accepted JSON and YAML formats.
- Configured size limits.
- Version-label requirements.
- Upload progress where available.
- Validation result.
- Duplicate-content feedback.
- Parser warnings and unsupported constructs.

The successful upload view should expose:

- Version label.
- OpenAPI version.
- Source format.
- Operation count.
- Parsing status.
- Support status.
- Runner eligibility where applicable.

Errors must identify the issue clearly and provide useful context when available.

### 5.5 API Explorer

The API Explorer presents specification content through three information levels.

**Operation navigation**

- Path and operation list.
- HTTP method.
- Operation summary.
- Tag or grouping information where available.

**Operation details**

- Description.
- Parameters.
- Request body.
- Response definitions.
- Security information where supported.

**Schema details**

- Object properties.
- Required and optional indicators.
- Data types.
- Constraints.
- Supported references.
- Source-document locations.

The explorer should support efficient navigation without requiring users to read the entire raw specification.

### 5.6 Comparison Workbench

The comparison workbench is the primary engineering screen.

Its purpose is to explain the difference between the baseline and candidate specifications.

Recommended desktop composition:

| Region | Responsibility |
|---|---|
| Left navigation panel | API operation navigation and finding filters |
| Center workspace | Change list and value comparison |
| Right detail panel | Classification, rule explanation, affected operations, and linked tests |

The comparison header must show:

- Project context.
- Baseline version.
- Candidate version.
- Comparison direction.
- Ruleset version.
- Analysis status.

A summary area may display the number of findings by classification.

Each finding should communicate:

- Classification.
- HTTP method and path where applicable.
- Change summary.
- Rule identifier.
- Source JSON Pointer or location.
- Previous value.
- Candidate value.
- Explanation and rationale.
- Affected operation identifiers.

The interface must clearly distinguish `COMPLETE`, `PARTIAL`, and `FAILED` analysis.

A `PARTIAL` report must display an explicit warning explaining that some relevant constructs were not fully evaluated.

### 5.7 Change Impact and Coverage

This view connects compatibility findings to affected operations and test cases.

Required information:

- Finding classification.
- Affected operation list.
- Linked test cases.
- Test-case source.
- Approval status.
- Coverage status.
- Relevant comparison context.

Coverage labels:

- `COVERED`
- `DRAFT_ONLY`
- `UNCOVERED`
- `UNMAPPED`

The interface must distinguish test-case availability from actual execution results.

An approved test case does not establish that a regression has passed.

### 5.8 Test Case Library

The Test Case Library manages manual and AI-generated test cases.

Required information:

- Test-case title.
- Description or objective.
- Source: Manual or AI.
- Linked operation.
- Baseline specification version.
- Draft, approved, or archived status.
- Supported request inputs.
- Assertions.
- Creation and update metadata.

Available actions depend on the test-case lifecycle.

Draft cases may be edited and reviewed. Approval must be deliberate. Approved cases must not be silently modified through ordinary draft-editing behavior.

AI-generated cases must be visibly identified as suggestions requiring human review.

### 5.9 AI Suggestion Review

The AI suggestion workflow must communicate that generated content is advisory and may require correction.

Required elements:

- Selected operation.
- Synthetic context information.
- Provider-submission preview.
- Explicit consent control.
- Generation status.
- Suggested test title.
- Test purpose.
- Request inputs.
- Expected assertions.
- Validation errors where applicable.
- Review and approval actions.

The generated content must be presented as structured test data. It must never be rendered or treated as executable code.

The interface should explain provider unavailability, validation failure, quota exhaustion, and rate-limit conditions without suggesting that core application functionality has failed.

### 5.10 Test-Run Results

The test-run details view presents execution evidence for a selected comparison.

Required elements:

- Run identifier.
- Related comparison.
- Baseline and candidate versions.
- Run status.
- Start and completion timestamps.
- Total and per-status test counts.
- Individual test results.
- Execution duration.
- HTTP status where available.
- Validation and assertion errors.
- Bounded response evidence.

Run statuses:

- `QUEUED`
- `RUNNING`
- `PASSED`
- `FAILED`
- `PARTIAL`
- `INTERRUPTED`

Individual result statuses:

- `PASSED`
- `FAILED`
- `SKIPPED`
- `UNSUPPORTED`
- `ERROR`

Sensitive values and unrestricted response bodies must not be displayed.

## 6. Reusable Component Inventory

The following component categories establish a consistent implementation vocabulary.

### Application shell

- `AppShell`
- `Sidebar`
- `Topbar`
- `Breadcrumbs`
- `PageHeader`

### Navigation and context

- `ProjectSelector`
- `VersionSelector`
- `OperationNavigation`
- `Breadcrumbs`

### Feedback and status

- `StatusBadge`
- `SeverityBadge`
- `AnalysisStatusBanner`
- `InlineError`
- `EmptyState`
- `Skeleton`
- `Toast`

### Specification and comparison

- `UploadDropzone`
- `OperationDetails`
- `SchemaTree`
- `ChangeList`
- `ChangeInspector`
- `SchemaValueDiff`

### Test management

- `TestCaseTable`
- `TestCaseEditor`
- `TestApprovalDialog`
- `TestRunSummary`
- `TestResultRow`

### AI workflow

- `AIConsentDialog`
- `SubmissionPreview`
- `SuggestionReviewPanel`

Components should be extracted when they are reused or when a shared interaction contract is needed. Avoid creating abstraction layers that do not serve an actual product requirement.

## 7. Interaction Standards

- Use action-oriented labels such as `Upload specification`, `Compare versions`, `Approve test`, and `Run tests`.
- Use one dominant primary action per view.
- Confirm destructive actions.
- Provide visible feedback for asynchronous actions.
- Prevent accidental duplicate submissions.
- Preserve form input when recoverable validation errors occur.
- Provide loading, empty, error, and success states.
- Show partial-analysis warnings prominently.
- Use tooltips only as supporting information.
- Provide copy feedback for technical values.
- Do not use optimistic updates for authoritative compatibility or regression results.

## 8. Responsive Behavior

### Desktop

Desktop is the primary workspace for information-dense comparison and schema inspection.

### Tablet

- Navigation may collapse.
- The three-panel comparison layout may become a selectable panel layout.
- Finding details remain accessible without horizontal overflow.

### Mobile

- Support navigation, project access, summaries, and reading results.
- Convert complex comparison panels into stacked or selectable sections.
- Keep primary actions available.
- Prevent tables and code blocks from breaking the viewport.

Responsive behavior must preserve access to the application's essential workflows.

## 9. Accessibility Requirements

Target WCAG 2.2 AA principles.

Requirements include:

- Semantic HTML structure.
- Logical heading hierarchy.
- Keyboard-operable navigation and controls.
- Visible keyboard focus.
- Accessible form labels and errors.
- Dialog focus management.
- Escape-key behavior where appropriate.
- Status communicated through text and icons as well as color.
- Adequate contrast for text and controls.
- Reduced-motion preferences respected.
- Readable content under browser zoom.
- Accessible tables and technical data views.

## 10. Design Acceptance Criteria

The design specification is satisfied when:

1. The application presents a consistent developer-workbench visual identity.
2. The comparison view prioritizes evidence and technical information.
3. Baseline and candidate versions are always distinguishable.
4. Compatibility and execution statuses are represented consistently.
5. Partial-analysis conditions cannot be mistaken for complete compatibility.
6. Test coverage and actual regression outcomes are clearly separated.
7. AI-generated suggestions remain visually distinct from approved test cases.
8. Primary workflows provide loading, empty, success, and error feedback.
9. Keyboard navigation is supported throughout primary workflows.
10. The layout remains usable across desktop, tablet, and mobile widths.

## 11. Related Documentation

- [Product Requirements](PRD.md)
- [Technical Requirements](TRD.md)
- [System Architecture](Architecture.md)
- [Application Flow](AppFlow.md)
- [Data Model and Schema](Schema.md)
- [Backend API](API.md)