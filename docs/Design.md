
# Product Design and UI/UX Specification

**Product:** ContractGuard  
**Document version:** 1.1  
**Design direction:** Precision Workbench  
**Status:** Revised design baseline  
**Related documents:** PRD.md, AppFlow.md, Architecture.md, API.md

## 1. Design vision

ContractGuard is a developer-facing API compatibility and regression-testing workbench.

Its interface should communicate precision, clarity, reliability, and technical depth.

The product should feel like a focused engineering tool where developers inspect API contracts, understand structural changes, trace their impact, and examine test evidence.

The design must prioritize the information required to make technical decisions over decorative elements.

**Core design principle: Make complex API changes easier to understand without hiding the underlying technical evidence.**

## 2. Design principles

### 2.1 Precision over decoration

Use technical tables, structured information, meaningful labels, and clear hierarchy.

Avoid visual elements that do not help users understand or act on API data.

### 2.2 Information density with clarity

Developers should be able to inspect a meaningful amount of technical information without constantly navigating between pages.

However, density must not come at the expense of readability, spacing, or clear grouping.

### 2.3 Evidence over unsupported claims

Every compatibility finding should provide access to its rule, source location, affected operation, and rationale.

A classification badge alone is insufficient.

### 2.4 Consistent interaction

Similar operations should look and behave consistently throughout the application.

Examples:

- Project creation should use a consistent form pattern.
- Upload feedback should use the same notification system.
- Compatibility classifications should use consistent semantic colors.
- Test results should use the same result vocabulary everywhere.

### 2.5 Honest system states

The interface must distinguish:

- Complete analysis.
- Partial analysis.
- Failed analysis.
- Test coverage.
- Successful regression.
- Failed regression.
- Unsupported execution.

A partially analyzed API must never look completely compatible simply because no breaking change was detected in the supported subset.

### 2.6 Technical information remains accessible

Advanced information may be progressively disclosed, but it should never be discarded or made inaccessible.

Developers must be able to inspect the original relevant JSON values, source locations, and validation diagnostics.

## 3. Visual identity

### 3.1 Design system name

**Precision Workbench**

### 3.2 Overall aesthetic

The interface uses:

- Neutral light workspace backgrounds.
- Deep graphite navigation surfaces.
- Restrained indigo as the primary interaction accent.
- Clear red, amber, green, and slate semantic states.
- Subtle borders and carefully controlled shadows.
- Technical typography for code, identifiers, paths, and JSON.
- Clean typography for normal application text.
- Structured layouts rather than decorative cards.

### 3.3 Avoid

Do not use:

- Excessive gradients.
- Glassmorphism.
- Neon effects.
- Large decorative illustrations.
- Overly rounded cards.
- Generic dashboard layouts dominated by oversized KPI cards.
- Excessive badges.
- Excessive animations.
- Decorative charts without a meaningful data requirement.
- Different visual treatments for the same semantic status.

The interface should look like a purpose-built developer product.

## 4. Color system

Use centralized semantic design tokens.

The following palette defines the initial direction. Exact shades may be adjusted during visual implementation after checking contrast.

### 4.1 Core colors

| Token | Initial value | Usage |
|---|---|---|
| `canvas` | `#F7F8FA` | Main application background |
| `surface` | `#FFFFFF` | Primary workspace surfaces |
| `surface-subtle` | `#F1F3F6` | Secondary sections and panels |
| `surface-hover` | `#E9EDF3` | Hovered rows and interactive surfaces |
| `border` | `#DCE1E8` | Standard borders and dividers |
| `border-strong` | `#C4CCD7` | Emphasized borders |
| `text-primary` | `#202633` | Main text |
| `text-secondary` | `#667085` | Supporting text |
| `text-muted` | `#8992A2` | Non-primary metadata |
| `navigation` | `#202633` | Graphite navigation rail |
| `navigation-hover` | `#303A4B` | Navigation hover |
| `accent` | `#4F46E5` | Primary actions and selected navigation |
| `accent-hover` | `#4338CA` | Primary interaction hover |

### 4.2 Semantic status colors

| Status | Suggested foreground | Suggested background | Meaning |
|---|---|---|---|
| Breaking | `#B42318` | `#FEE4E2` | Confirmed breaking finding |
| Potentially breaking | `#B54708` | `#FEF0C7` | Possible consumer impact |
| Non-breaking | `#067647` | `#D1FADF` | Supported compatibility result |
| Informational | `#475467` | `#EAECF0` | Metadata or documentation change |
| Unsupported | `#6941C6` | `#F4EBFF` | Construct outside supported analysis |
| Partial | `#B54708` | `#FEF0C7` | Incomplete analysis or execution |
| Failed | `#B42318` | `#FEE4E2` | Analysis, assertion, or execution failure |
| Passed | `#067647` | `#D1FADF` | Successful execution |
| Running | `#3538CD` | `#E0EAFF` | Active execution |
| Queued | `#475467` | `#EAECF0` | Waiting for execution |
| Interrupted | `#667085` | `#F2F4F7` | Execution stopped before completion |

Colors must never be the only means of communicating meaning.

Every classification and result must also have visible text.

### 4.3 Color implementation rules

- Define colors as reusable tokens.
- Use semantic colors consistently.
- Keep neutral information neutral.
- Avoid coloring entire panels when a small status indicator is sufficient.
- Check text and component contrast.
- Do not use red and green as the only distinction between states.
- Test all status colors against their backgrounds.

## 5. Typography

Use a clear, professional typography hierarchy.

Suggested font roles:

| Role | Suggested font | Usage |
|---|---|---|
| Interface | Inter or a comparable sans-serif | Normal application text |
| Technical/code | JetBrains Mono or a comparable monospace | JSON, paths, identifiers, code |
| Fallback | System sans-serif and monospace stacks | Reliable rendering |

Font files should not be bundled unnecessarily.

### 5.1 Text hierarchy

| Element | Relative emphasis |
|---|---|
| Application page title | Highest |
| Section heading | High |
| Panel title | Medium-high |
| Body text | Normal |
| Table metadata | Secondary |
| Supporting descriptions | Secondary |
| Technical identifiers | Monospace |

Avoid oversized headings.

Most application screens should prioritize their working content rather than large introductory titles.

### 5.2 Technical text

Use monospace for:

- HTTP methods.
- API paths.
- JSON keys.
- JSON Pointer values.
- Schema types.
- Rule IDs.
- Test identifiers.
- Version hashes.
- Request and response examples.

Long values should wrap, truncate with an accessible full-value reveal, or be displayed in a horizontally scrollable code region where appropriate.

## 6. Layout system

### 6.1 Global application shell

The authenticated application uses three main layout regions:

1. Navigation rail/sidebar.
2. Main content area.
3. Contextual detail area when a screen requires it.

The layout should remain consistent across projects, specifications, comparisons, and test results.

### 6.2 Navigation

The primary navigation uses a deep graphite background.

It contains:

- ContractGuard wordmark.
- Projects navigation.
- Current project context.
- Relevant feature navigation.
- Account and logout actions.

Navigation should be compact and consistent.

Selected navigation uses a restrained indigo accent and an obvious selected state.

### 6.3 Main content

The workspace uses a neutral background and white or near-white working surfaces.

Use:

- Consistent page padding.
- Clearly separated sections.
- Aligned headings and content boundaries.
- Predictable table layouts.
- Consistent vertical rhythm.

Avoid unnecessary nested containers.

### 6.4 Panel treatment

Use subtle borders to distinguish functional areas.

Cards or panels should group meaningful information, not decorate every field.

Use shadows sparingly.

Do not place every table row or every metadata item into its own card.

## 7. Signature screen: API comparison workspace

This is the most important visual component of ContractGuard.

It should receive the greatest design and implementation attention.

### 7.1 Primary layout

The default desktop layout uses three coordinated panels:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Navigation │ Comparison Header                                             │
│            │ Baseline: v1         Candidate: v2      Analysis: COMPLETE     │
│            ├───────────────────┬───────────────────┬───────────────────────┤
│            │                   │                   │                       │
│            │ Version / Schema  │ Change List       │ Change Details        │
│            │ Context           │                   │                       │
│            │                   │                   │                       │
│            │ Baseline /        │ BREAKING          │ Rule: RES-002         │
│            │ Candidate         │ POTENTIALLY ...   │                       │
│            │                   │ NON-BREAKING      │ Rationale             │
│            │                   │                   │ Source JSON Pointer   │
│            │                   │                   │                       │
│            │                   │                   │ Affected Operations   │
│            │                   │                   │                       │
│            │                   │                   │ Linked Test Cases     │
│            │                   │                   │                       │
└────────────┴───────────────────┴───────────────────┴───────────────────────┘
```

The left panel provides version and source context.

The center panel displays detected changes and filters.

The right panel explains the selected change and its test impact.

### 7.2 Comparison header

The header displays:

- Project name.
- Baseline version label.
- Candidate version label.
- Comparison direction.
- Ruleset version.
- Overall analysis status.
- Comparison timestamp.

The comparison direction must be explicit:

`Baseline consumer → Candidate provider`

Do not assume that users will infer direction from version labels.

### 7.3 Left panel: version and schema context

The panel provides relevant baseline and candidate context.

Possible content:

- API path tree.
- HTTP method indicators.
- Operation hierarchy.
- Relevant schema information.
- Source document location.
- Baseline/candidate value selection.

The selected item should remain synchronized with the selected change where possible.

The interface must not attempt to display the entire OpenAPI document at once.

Use progressive disclosure for detailed schema content.

### 7.4 Center panel: change list

Each change row displays:

- Classification.
- Short summary.
- HTTP method and path where relevant.
- Rule identifier.
- Affected-operation indicator where appropriate.

Users can filter by:

- Classification.
- HTTP method.
- API path.
- Text search.

The selected row must have a clear active state.

The list should support keyboard selection and predictable row navigation.

Do not show long rationales inside the change list. Detailed explanations belong in the right panel.

### 7.5 Right panel: change detail

The detail panel displays:

**Classification**

Breaking, potentially breaking, non-breaking, informational, or unsupported.

**Rule information**

- Rule ID.
- Rule description.
- Classification rationale.

**Location**

- JSON Pointer.
- Original source location where available.

**Value comparison**

Baseline and candidate values should be shown side by side where meaningful.

Example:

```json
// Baseline
{
  "price": 99.5
}
```

```json
// Candidate
{
  "price": "99.50"
}
```

**Affected operations**

Display the operations impacted by the finding.

For shared-schema changes, indicate that the finding affects multiple operations.

**Test coverage**

Display:

- Number of linked test cases.
- Approved count.
- Draft count.
- Coverage status.
- Available test-case navigation.

**Regression evidence**

When test runs exist, show their relationship to the comparison and the relevant test cases.

The interface must distinguish coverage from an actual passing regression run.

### 7.6 Width and resizing

The three-panel arrangement should use adjustable proportions on desktop.

Initial design proportions may use:

- Left panel: approximately 24%.
- Center panel: approximately 32%.
- Right panel: approximately 44%.

These are starting points, not fixed pixel requirements.

Minimum panel widths must preserve usability.

If the viewport cannot support three readable panels, collapse the layout into selectable tabs or a stacked view.

Avoid creating horizontal scrolling across the entire page.

### 7.7 Important interaction behavior

- Selecting a change updates its detail panel.
- Selecting an affected operation opens its relevant operation context.
- Selecting a linked test case opens the test-case detail.
- Returning to the comparison should preserve the selected change when practical.
- Unsupported details remain accessible and visually distinguishable.
- Long JSON content can be expanded without breaking the overall layout.

## 8. Screen specifications

### 8.1 Login

Purpose: Authenticate an existing user.

Content:

- ContractGuard identity.
- Email.
- Password.
- Login action.
- Registration link.
- Inline validation and authentication feedback.

Keep the layout focused and uncluttered.

### 8.2 Registration

Purpose: Create a user account.

Content:

- Display name, optional.
- Email.
- Password.
- Registration action.
- Login navigation.
- Password requirement guidance.

### 8.3 Projects workspace

Purpose: Provide an overview of the user's projects.

Content:

- Page title.
- Create-project action.
- Project list or compact table.
- Project name.
- Description.
- Specification count.
- Last activity.
- Relevant recent comparison status.

Avoid filling the page with oversized KPI cards.

The primary task is opening or creating a project.

### 8.4 Project overview

Purpose: Show the current project's working context.

Content:

- Project name and description.
- Specification version list.
- Recent comparisons.
- Recent test runs.
- Upload action.
- Compare action.

Empty projects should make the first upload action obvious.

### 8.5 Specification upload

Purpose: Import and validate an OpenAPI file.

Content:

- File selection or drag-and-drop region.
- Supported file formats.
- Maximum size.
- Version label input.
- Upload action.
- Upload progress.
- Validation feedback.

Do not automatically upload a file merely because it was dragged into the interface; provide an explicit submission step.

### 8.6 Specification detail

Purpose: Inspect one immutable API version.

Content:

- Version label.
- OpenAPI version.
- Source format.
- Upload date.
- Operation count.
- Parse status.
- Supported-feature warnings.
- Runner eligibility.
- Explore action.
- Compare action.

Do not make runner eligibility look like full API validity. A specification can be valid but not eligible for the bundled runner.

### 8.7 API Explorer

Purpose: Inspect operations and supported schemas.

Suggested layout:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ API Explorer                                      Specification: v1    │
├───────────────────┬────────────────────────────────────────────────────┤
│ Paths             │ Operation Details                                  │
│                   │                                                    │
│ GET /products     │ GET /products/{productId}                          │
│ POST /products    │ Parameters                                         │
│ GET /orders       │ Request                                            │
│                   │ Responses                                          │
│                   │ Schema                                             │
│                   │ References                                         │
└───────────────────┴────────────────────────────────────────────────────┘
```

Use clear HTTP method indicators.

The operation detail area should show request and response definitions in a structured manner.

### 8.8 Comparison creation

Purpose: Select two specification versions.

Content:

- Baseline selector.
- Candidate selector.
- Clear description of comparison direction.
- Selected version summaries.
- Compare action.

The interface should prevent selecting the same version twice.

### 8.9 Test-case library

Purpose: Manage test cases belonging to specification versions.

Content:

- Test title.
- Operation.
- Baseline version.
- Source: manual or AI.
- Status: draft, approved, archived.
- Last updated.
- Relevant filters.

Do not confuse AI-generated and manually created cases.

### 8.10 Test-case detail

Purpose: Review one test case.

Content:

- Title and description.
- Baseline specification version.
- Operation path and method.
- Path parameters.
- Query parameters.
- Explicit assertions.
- Source.
- Current approval status.
- Creation and update information.

Approval must be a clear, deliberate action.

### 8.11 AI suggestion review

Purpose: Review candidate test ideas before they enter the approved test library.

Content:

- Selected synthetic fixture.
- Selected operation.
- Provider data-sharing disclosure.
- Context preview.
- Explicit consent.
- Proposed test list.
- Test title.
- Rationale.
- Suggested inputs and assertions.
- Edit, discard, and approve actions.

Every suggestion is visibly marked as AI-generated and remains a draft until approved.

If the AI feature is disabled, display its availability state without preventing manual test-case creation.

### 8.12 Test-run detail

Purpose: Display execution results and evidence.

Content:

- Run identifier.
- Associated comparison.
- Baseline and candidate.
- Ruleset version.
- Bundled implementation version.
- Run status.
- Test result counts.
- Selected cases.
- Individual result rows.
- HTTP status when available.
- Execution duration.
- Validation errors.
- Bounded evidence.

A result row should support expansion to reveal technical details without making the main results table excessively wide.

### 8.13 Account

Purpose: Display the signed-in account and allow logout.

Do not introduce account-management features beyond the v1 requirements.

## 9. Tables and technical information

Tables are central to ContractGuard.

Use clear column headers, consistent alignment, and visible row hover/selection states.

### 9.1 Change table

Suggested columns:

| Column | Content |
|---|---|
| Severity | Classification |
| Change | Short description |
| Operation | HTTP method and path |
| Rule | Rule ID |
| Coverage | Linked test status |

Avoid showing too many columns at the same time on narrow screens.

### 9.2 Test results table

Suggested columns:

| Column | Content |
|---|---|
| Result | Test outcome |
| Test case | Title |
| Operation | Method/path |
| HTTP status | Actual status when available |
| Duration | Execution time |

Detailed evidence should be available through row expansion or the test detail view.

### 9.3 Technical data presentation

- Use monospace for code and identifiers.
- Indent JSON consistently.
- Syntax-highlight only where it improves readability.
- Avoid overly bright syntax colors.
- Preserve the ability to inspect raw values.
- Provide copy controls for useful technical identifiers and paths.
- Do not expose hidden data or secrets through copy actions.

## 10. Component patterns

Create reusable components for repeated interface behavior.

Suggested component categories:

### Layout

- `AppShell`
- `Sidebar`
- `TopBar`
- `PageContainer`
- `PageHeader`
- `Panel`

### Feedback

- `StatusBadge`
- `Alert`
- `Toast`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `PartialState`

### Technical display

- `MethodBadge`
- `ApiPath`
- `JsonViewer`
- `JsonDiffViewer`
- `CodeBlock`
- `RuleReference`
- `OperationList`

### Comparison

- `ComparisonHeader`
- `ComparisonSidebar`
- `ChangeList`
- `ChangeListItem`
- `ChangeDetailPanel`
- `AffectedOperations`
- `TestCoverageSummary`

### Testing

- `TestCaseTable`
- `TestCaseEditor`
- `TestCaseStatus`
- `TestRunSummary`
- `TestResultTable`
- `TestEvidencePanel`

These are proposed component responsibilities, not mandatory file names.

Avoid creating a separate component for every small text label or metadata field.

## 11. Interaction design

### 11.1 Buttons

Use a consistent button hierarchy.

**Primary**

For the main action on a screen:

- Create Project.
- Upload Specification.
- Compare Versions.
- Approve Test.
- Run Tests.

**Secondary**

For supporting actions:

- Cancel.
- View Details.
- Edit.
- Open Explorer.

**Destructive**

For actions that remove or archive resources where appropriate.

Destructive actions require clear labels and confirmation when the effect is significant.

### 11.2 Tables

- Entire row selection should be available only where it is an obvious interaction.
- Interactive text and controls should have independent focus behavior.
- Hover states should not be the only indication that a row is clickable.
- Selected rows must have a distinct visual indicator.
- Keyboard navigation must remain possible.

### 11.3 Forms

- Labels must remain visible.
- Required fields must be identified.
- Validation should appear near the relevant field.
- Preserve user input after recoverable errors.
- Disable repeated submission while the same request is pending.
- Display clear success and error feedback.

### 11.4 Notifications

Use notifications for concise feedback.

Examples:

- Project created.
- Upload completed.
- Test case approved.
- Run accepted.
- Unable to save changes.

Do not use notifications as a substitute for persistent error or partial-analysis details.

### 11.5 Destructive actions

Require confirmation for:

- Project deletion.
- Archiving where the effect is not immediately reversible.
- Any future permanent deletion action.

Confirmation dialogs must clearly explain the effect.

## 12. Application state design

Every major interface must define its loading, empty, error, and partial states.

### 12.1 Loading state

Use:

- A clear progress indicator.
- Skeleton content where useful.
- Disabled repeated submission while a request is active.

Do not show stale results as though a new comparison has completed.

### 12.2 Empty state

Examples:

- No projects.
- No specification versions.
- No comparisons.
- No linked test cases.
- No test history.

Provide the next useful action and a brief explanation.

### 12.3 Error state

Examples:

- Request validation error.
- Authentication expiry.
- Network failure.
- Upload rejection.
- Failed comparison.
- Failed execution.

Show an understandable explanation and a safe recovery path.

### 12.4 Partial state

Partial states deserve particular attention.

Examples:

- Unsupported OpenAPI keywords.
- Incomplete shared-reference impact.
- Unsupported response schema.
- Unsupported runner operation.
- Interrupted test run.

Always show why the result is partial and what could not be evaluated.

### 12.5 Disabled action

If a button is disabled because of a domain restriction, provide a useful explanation.

Examples:

- Candidate is not a recognized bundled fixture.
- No approved test cases are available.
- Comparison has not completed.
- AI is unavailable.
- Selected test cases do not belong to the baseline.

Do not leave users guessing why an action is unavailable.

## 13. Responsive behavior

ContractGuard is primarily a desktop developer workbench.

The initial visual target is a desktop browser at approximately 1440px width.

However, the application must remain usable at narrower widths.

### 13.1 Desktop

- Persistent sidebar.
- Three-panel comparison workspace.
- Full technical tables.
- Resizable or adjustable panel proportions.
- Visible contextual information.

### 13.2 Tablet

- Collapsible navigation.
- Reduced panel widths.
- Comparison panels may become tabs.
- Tables may hide lower-priority columns.
- Detail content remains accessible.

### 13.3 Mobile

- Compact navigation.
- Single-column layouts.
- Comparison panels become selectable sections.
- Technical tables become stacked or horizontally scrollable within their own container.
- Forms remain fully usable.
- Status and validation messages remain visible.

Do not attempt to force the desktop three-column comparison layout onto a mobile screen.

## 14. Accessibility requirements

Target WCAG 2.2 AA-oriented practices.

Requirements:

- Semantic HTML.
- Proper heading hierarchy.
- Accessible labels.
- Keyboard operation for navigation and primary workflows.
- Visible focus indicators.
- Appropriate text and component contrast.
- Accessible status announcements.
- Descriptive button names.
- Meaningful error messages.
- Accessible modal focus behavior.
- Keyboard-accessible tabs and expandable panels.
- No reliance on color alone.
- Reduced-motion support where animation exists.

Use accessible native controls wherever practical.

For tables, use correct header and data-cell semantics.

For custom interactive components, implement expected keyboard and screen-reader behavior.

These design requirements do not constitute a claim of formal accessibility certification.

## 15. Motion and animation

Keep motion subtle and functional.

Permitted examples:

- Small panel transitions.
- Expand/collapse interactions.
- Loading indicators.
- Subtle hover transitions.
- Navigation state transitions.

Avoid:

- Large page-transition animations.
- Decorative floating effects.
- Repeated attention-grabbing movement.
- Animated dashboards without user benefit.

Respect `prefers-reduced-motion`.

## 16. Visual consistency rules

- Use the same spacing scale throughout the application.
- Use consistent border radii.
- Use consistent table density.
- Use semantic status colors consistently.
- Use consistent HTTP method indicators.
- Use consistent typography for code.
- Use the same interaction states for repeated components.
- Avoid multiple visual styles for the same classification.
- Keep the comparison workspace visually aligned with the rest of the product.
- Use iconography consistently and only where it improves recognition.

## 17. Design acceptance criteria

The design is accepted when:

1. The application uses the Precision Workbench visual direction.
2. Navigation is visually consistent across authenticated screens.
3. The comparison workspace uses the coordinated three-panel desktop layout.
4. Comparison direction is visible and unambiguous.
5. Change classifications have consistent semantic treatments.
6. Each change exposes its rule, rationale, location, and affected operations.
7. Test coverage is distinguished from regression execution results.
8. Unsupported and partial states are clearly visible.
9. Test-run results distinguish failure, unsupported execution, errors, and interruption.
10. AI-generated test suggestions are visibly identified as drafts.
11. Forms provide clear validation and submission feedback.
12. Tables remain readable and usable with keyboard input.
13. The application adapts to tablet and mobile widths.
14. Color contrast and visible focus are checked.
15. Primary interactions work without relying on hover.
16. There are no decorative UI elements that obscure technical information.
17. Loading, empty, error, and partial states are implemented on all major workflows.
18. The design remains usable when AI is disabled.

## 18. Design references

Use these as implementation references, not templates to copy blindly.

- Tailwind CSS documentation:  
  https://tailwindcss.com/docs

- Lucide icons:  
  https://lucide.dev/icons/

- WCAG 2.2:  
  https://www.w3.org/TR/WCAG22/

- WAI-ARIA Authoring Practices Guide:  
  https://www.w3.org/WAI/ARIA/apg/

- React accessibility guidance:  
  https://react.dev/learn/accessibility
