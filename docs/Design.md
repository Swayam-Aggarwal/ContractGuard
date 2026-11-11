# Product Design and UI Specification

**Product:** ContractGuard
**Version:** 1.1
**Design Direction:** Precision Workbench

## 1. Design Objective

ContractGuard is a developer workbench. Its interface must communicate precision, traceability, and confidence without looking like a generic admin template.

The primary interface is a technical comparison workspace, not a dashboard made from interchangeable statistic cards.

The visual language should emphasize clear hierarchy, aligned data, restrained colors, strong typography, and high information density without compromising readability.

## 2. Design Principles

1. **Evidence before decoration:** Prioritize changed paths, old and new values, rule IDs, and explanations.
2. **One primary action per view:** Each screen should have one visually dominant action.
3. **Progressive disclosure:** Advanced technical details should be accessible without overwhelming the default view.
4. **Accurate status representation:** `POTENTIALLY_BREAKING` and `PARTIAL` must never appear as confirmed safe results.
5. **Consistent terminology:** UI labels must follow the terminology used in the API and compatibility documentation.
6. **Accessibility:** All primary functions must support keyboard navigation. Color must never be the only status indicator.

## 3. Visual Identity

### 3.1 Precision Workbench

- Neutral light workspace.
- Deep graphite navigation rail.
- Indigo primary interaction accent.
- Muted surfaces and thin borders.
- Semantic colors reserved for statuses and feedback.
- Monospaced typography for code and schema values.
- No unnecessary gradients, glassmorphism, oversized hero sections, or decorative charts.

### 3.2 Design Tokens

Use CSS custom properties to maintain consistent styling.

| Token | Value | Usage |
|---|---|---|
| `--cg-shell` | `#151922` | Sidebar and application chrome |
| `--cg-shell-muted` | `#202633` | Sidebar hover and active states |
| `--cg-canvas` | `#F5F7FA` | Main application background |
| `--cg-surface` | `#FFFFFF` | Panels and menus |
| `--cg-surface-subtle` | `#F8FAFC` | Secondary panel backgrounds |
| `--cg-border` | `#E2E8F0` | Dividers and outlines |
| `--cg-text` | `#172033` | Primary text |
| `--cg-text-muted` | `#64748B` | Secondary text |
| `--cg-primary` | `#4F46E5` | Primary actions and selected navigation |
| `--cg-danger` | `#C2414B` | Breaking changes and errors |
| `--cg-warning` | `#B7791F` | Potentially breaking changes and warnings |
| `--cg-success` | `#16805D` | Successful outcomes and non-breaking changes |
| `--cg-info` | `#2563EB` | Informational states |

Semantic colors must always be accompanied by text labels or icons. Verify foreground and background contrast before release.

### 3.3 Typography

- Primary interface: Inter with a system sans-serif fallback.
- Technical content: `ui-monospace`, SFMono-Regular, Consolas, monospace.
- Page titles: 24–28 px, semibold.
- Section titles: 15–18 px, semibold.
- Body text: 14 px.
- Metadata: 12–13 px.
- Code: 12–13 px with comfortable line height.

Avoid decorative typefaces. Long technical values must wrap appropriately or provide copy controls.

### 3.4 Spacing and Shape

Use a 4 px base spacing scale.

Common spacing values:

- 8 px
- 12 px
- 16 px
- 20 px
- 24 px
- 32 px

Panels should use 8–12 px corner radii. Buttons and inputs should use 6–8 px radii.

Prefer subtle borders over heavy shadows. Reserve shadows for overlays, menus, and elevated elements.

## 4. Application Shell

### 4.1 Desktop Layout

The desktop interface is the primary experience.

- Sidebar: approximately 232–248 px fixed width.
- Main workspace: flexible width.
- Top bar: breadcrumb, project context, current version, and account menu.
- Main content: consistent horizontal spacing.
- Forms and onboarding screens may use a narrower maximum content width.

### 4.2 Sidebar Navigation

Navigation should expose only implemented functionality.

The intended primary navigation includes:

- Projects
- API Explorer
- Comparisons
- Test Cases

Test Runs and AI-related navigation should appear only after their respective features are implemented.

Project-specific navigation may be displayed contextually. Account settings and user actions belong near the bottom of the sidebar.

## 5. Screen Specifications

### 5.1 Projects Home

**Purpose:** Help users create projects and resume previous work.

Required elements:

- Product heading and concise description.
- Primary `New project` action.
- Recent projects table.
- Project name and latest specification version.
- Last activity and available status information.
- Empty state explaining how to create the first project.

Avoid oversized welcome banners and meaningless KPI cards.

### 5.2 Project Overview

Required elements:

- Project name and description.
- Available specification versions.
- Baseline and candidate version selection.
- Recent comparison reports.
- Actions to upload a specification and compare versions.
- Warnings when an analysis is partial or incomplete.

The page should help users understand the current project state without duplicating detailed comparison findings.

### 5.3 API Explorer

The API Explorer should provide three levels of information:

1. Operation list grouped by tag or path.
2. Selected operation summary, including method, path, parameters, request body, and responses.
3. Expandable schema details, including required and optional properties and source locations.

Requirements:

- HTTP methods use consistent visual labels.
- Search and filtering support keyboard input.
- Long paths and schema values remain readable.
- Unsupported constructs are identified clearly.
- Empty and loading states are provided.
- Technical details remain accessible without excessive visual density.

### 5.4 Version Comparison Workbench

This is the signature screen of ContractGuard.

The desktop layout uses three primary areas:

**Left panel**
- Operation and path explorer.
- Severity filters.
- Finding navigation.

**Center panel**
- Compatibility finding list.
- Selected change details.
- Side-by-side baseline and candidate values where applicable.

**Right inspector**
- Finding classification.
- Rule ID.
- Explanation and rationale.
- Source location.
- Affected operations.
- Linked test cases and coverage information.

The screen header must display:

- Baseline version.
- Candidate version.
- Comparison direction.
- Overall analysis status.

A summary section may display counts for:

- Breaking.
- Potentially breaking.
- Non-breaking.
- Informational.
- Unsupported findings.

Each finding must display relevant information:

- Classification.
- HTTP method and path, where applicable.
- JSON Pointer or source location.
- Old and new values.
- Rule ID.
- Explanation.

The interface must clearly distinguish `COMPLETE` from `PARTIAL` analysis.

Never display a general green compatibility indicator when unsupported constructs remain.

### 5.5 Test Case Workspace

Required elements:

- Test case title.
- Source (`MANUAL` or `AI`).
- Linked API operation.
- Supported path and query parameters.
- Expected status and response assertions.
- Current lifecycle status.
- Available actions based on the lifecycle state.

Lifecycle labels:

- `DRAFT`
- `APPROVED`
- `ARCHIVED`

Draft cases may be edited and reviewed. Approval must be an explicit user action.

AI-generated suggestions, when implemented, must appear as drafts and must never be automatically approved.

### 5.6 Test Run Results

This screen belongs to the planned regression-runner phase.

When implemented, it should display:

- Run status and timestamps.
- Total, passed, failed, skipped, unsupported, and error counts.
- Filterable individual result table.
- Test-case title and linked operation.
- Expected and actual results.
- Execution duration.
- Validation diagnostics.
- Link to the associated comparison and specification versions.

Do not expose secrets, credentials, or unrestricted response data in result details.

### 5.7 AI Suggestion Review

This screen belongs to the planned AI integration phase.

Required elements:

- Clear notice that AI-generated suggestions may be incorrect.
- Sanitized preview of the context being sent to the provider.
- Explicit consent before external submission.
- Suggested test title and rationale.
- Suggested operation and input values.
- Expected assertions.
- Review, edit, approve, and discard actions.
- Provider and model information where available.

AI output must never be rendered or treated as executable code.

## 6. Reusable Component Inventory

The following components may be developed when needed:

| Component | Responsibility |
|---|---|
| `AppShell` | Main application layout |
| `Sidebar` | Primary navigation |
| `Topbar` | Project context and account actions |
| `Breadcrumbs` | Navigation hierarchy |
| `PageHeader` | Page title and primary action |
| `SectionHeader` | Section-level heading |
| `EmptyState` | Empty data presentation |
| `StatusBadge` | General status display |
| `SeverityBadge` | Compatibility severity |
| `AnalysisStatusBanner` | Complete and partial analysis states |
| `MethodBadge` | HTTP method display |
| `CodeBlock` | Formatted technical content |
| `JsonTree` | Expandable JSON presentation |
| `OperationTree` | API operation navigation |
| `OperationDetails` | Selected operation information |
| `VersionSelector` | Specification version selection |
| `UploadDropzone` | Specification upload interface |
| `ChangeList` | Compatibility findings |
| `ChangeInspector` | Selected finding details |
| `SchemaValueDiff` | Baseline and candidate schema differences |
| `TestCaseTable` | Test-case management |
| `TestRunSummary` | Execution summary |
| `TestResultRow` | Individual test result |
| `ConfirmDialog` | Confirmation for destructive actions |
| `Toast` | Temporary feedback |
| `InlineError` | Contextual errors |
| `Skeleton` | Loading placeholders |

Build reusable components when they are shared across screens or require a common interaction and state contract.

Do not create a separate design-system package for this project.

## 7. Interaction Standards

- Primary buttons should use clear action verbs.
- Examples include `Upload specification`, `Compare versions`, and `Approve test`.
- Destructive actions require confirmation.
- Asynchronous actions must display pending states.
- Duplicate submissions should be prevented where appropriate.
- Tables must support loading, empty, error, and populated states.
- Long-running actions must display progress or a clear running status.
- Copy controls must provide success or failure feedback.
- Tooltips must supplement accessible labels rather than replace them.
- Optimistic updates should be limited to suitable reversible interface changes.
- Persisted compatibility findings must come from the backend.

## 8. Responsive Behavior

**Desktop**

The primary experience supports the complete comparison workbench and its multi-panel layout.

**Tablet**

- Sidebar collapses.
- The three-panel comparison layout becomes selectable or collapsible panels.
- Important finding details remain accessible.

**Mobile**

- Project navigation remains accessible.
- Comparison summaries remain readable.
- Finding details use a stacked layout.
- Long technical values must not cause horizontal page overflow.
- Complex schema comparisons may use vertically stacked sections.

No primary application action should become inaccessible on smaller screens.

## 9. Accessibility Requirements

Target WCAG 2.2 AA principles.

Requirements:

- Semantic headings and landmarks.
- Keyboard-operable navigation and controls.
- Visible focus indicators.
- Appropriate focus management in dialogs.
- Escape-key support where appropriate.
- Status communicated through text and icons, not color alone.
- Sufficient text and control contrast.
- Reduced-motion preferences respected.
- Form errors connected to their inputs.
- Accessible announcements for important validation feedback.
- Readable technical content at increased browser zoom.

## 10. Design References

Use these products as references for interaction patterns and information hierarchy, not as templates to copy.

- Scalar API Reference — API operation navigation and technical reading experience.
- Postman — Request and response organization.
- Sentry — Issue severity and technical evidence presentation.
- shadcn/ui — Accessible component implementation patterns.
- Lucide — Consistent iconography.

## 11. Design Acceptance Criteria

The design is accepted when:

1. The comparison screen feels like a professional developer workbench rather than a generic admin dashboard.
2. Primary workflows have appropriate loading, empty, error, success, and partial-analysis states.
3. Every severity and analysis status has a clear text label.
4. Keyboard-only navigation works for all primary workflows.
5. Desktop, tablet, and mobile layouts remain usable.
6. Technical tables display meaningful labels and values.
7. No placeholder metrics or decorative charts are presented as real application data.
8. Implemented features are visually distinguishable from planned capabilities.
9. Comparison findings remain understandable without requiring users to inspect raw JSON.
