
import { useMemo, useState } from "react";

import {
  Link,
  useParams,
} from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  Archive,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  GitCompareArrows,
  Info,
  Save,
  ShieldAlert,
} from "lucide-react";

import { useProject } from "../features/projects/projects.js";
import { useDiffReport } from "../features/comparisons/diffReports.js";
import { useSpecificationOperations } from "../features/specifications/specifications.js";
import {
  useApproveTestCase,
  useArchiveTestCase,
  useCreateTestCase,
  useTestCases,
  useUpdateTestCase,
} from "../features/testCases.js";

import "./TestCasesPage.css";

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});

const DEFAULT_REQUEST = JSON.stringify(
  {
    pathParams: {},
    queryParams: {},
  },
  null,
  2
);

const DEFAULT_ASSERTIONS = JSON.stringify(
  {
    expectedStatus: 200,
    propertyAssertions: [],
    requiredProperties: [],
  },
  null,
  2
);

const FILTERS = [
  { value: "ALL", label: "All cases" },
  { value: "DRAFT", label: "Drafts" },
  { value: "APPROVED", label: "Approved" },
  { value: "ARCHIVED", label: "Archived" },
];

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parseJsonObject = (value, label) => {
  let parsed;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed;
};

const createDetailForm = (testCase) => ({
  title: testCase?.title || "",
  description: testCase?.description || "",
  request: JSON.stringify(testCase?.request ?? {}, null, 2),
  assertions: JSON.stringify(testCase?.assertions ?? {}, null, 2),
});

const formatDate = (value) => {
  if (!value) return "â€”";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "â€”";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const statusLabel = (status) => ({
  DRAFT: "Draft",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
  COVERED: "Covered",
  DRAFT_ONLY: "Draft only",
  UNCOVERED: "Uncovered",
  UNMAPPED: "Unmapped",
}[status] || status || "Unknown");

const StatusBadge = ({ status }) => (
  <span className={`test-case-status test-case-status-${String(status || "unknown").toLowerCase()}`}>
    {statusLabel(status)}
  </span>
);

const QueryError = ({ error, onRetry }) => (
  <div className="test-case-error" role="alert">
    <AlertCircle size={18} />
    <div>
      <strong>Unable to load test-case data</strong>
      <p>{error?.message || "The request could not be completed."}</p>
      {onRetry && (
        <button type="button" className="test-case-text-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  </div>
);

const Field = ({ label, hint, children }) => (
  <label className="test-case-field">
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
);

const TestCaseListItem = ({ testCase, selected, onSelect }) => (
  <button
    type="button"
    className={`test-case-list-item ${selected ? "is-selected" : ""}`}
    onClick={onSelect}
    aria-pressed={selected}
  >
    <div className="test-case-list-item-top">
      <span className="test-case-list-title">{testCase.title}</span>
      <StatusBadge status={testCase.status} />
    </div>
    <span className="test-case-list-operation">
      <strong>GET</strong>
      <code>{testCase.operationPath}</code>
    </span>
    <span className="test-case-list-meta">
      {testCase.source === "AI" ? "AI generated" : "Manual"}
      <span>Â·</span>
      Updated {formatDate(testCase.updatedAt)}
    </span>
  </button>
);

const CoverageChange = ({ change }) => {
  const coverage = change.testCoverage ?? EMPTY_OBJECT;
  const affectedKeys = change.affectedOperationKeys ?? EMPTY_ARRAY;

  return (
    <article className="coverage-change-card">
      <div className="coverage-change-heading">
        <div>
          <div className="coverage-change-meta">
            <span>{change.method || "Document"}</span>
            <code>{change.path || "Document-level change"}</code>
          </div>
          <h3>{change.summary || change.message || change.changeType}</h3>
        </div>
        <StatusBadge status={coverage.coverageStatus || "UNMAPPED"} />
      </div>

      <p className="coverage-change-description">
        {change.field || change.category || "Contract change"}
        {change.ruleId ? ` Â· ${change.ruleId}` : ""}
      </p>

      <div className="coverage-operation-summary">
        <span>{coverage.coveredOperationCount ?? 0} approved-covered</span>
        <span>{coverage.draftOnlyOperationCount ?? 0} draft-only</span>
        <span>{coverage.uncoveredOperationCount ?? 0} uncovered</span>
        <span>{coverage.totalLinkedTestCases ?? 0} linked cases</span>
      </div>

      {affectedKeys.length > 0 && (
        <details className="coverage-operation-details">
          <summary>{affectedKeys.length} affected baseline operation{affectedKeys.length === 1 ? "" : "s"}</summary>
          <div>
            {affectedKeys.map((operationKey) => (
              <code key={operationKey}>{operationKey}</code>
            ))}
          </div>
        </details>
      )}

      {coverage.linkedTestCases?.length > 0 && (
        <div className="coverage-linked-cases">
          <strong>Linked test cases</strong>
          {coverage.linkedTestCases.map((testCase) => (
            <div key={testCase.id}>
              <span>{testCase.title}</span>
              <StatusBadge status={testCase.status} />
            </div>
          ))}
          {coverage.linkedTestCasesTruncated && (
            <small>Additional linked cases are omitted from this report view.</small>
          )}
        </div>
      )}
    </article>
  );
};

const TestCasesPage = () => {
  const { projectId, specVersionId, reportId } = useParams();
  const isCoverageView = Boolean(reportId);

  const [filter, setFilter] = useState("ALL");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState("");
  const [detailError, setDetailError] = useState("");

  const [newOperationKey, setNewOperationKey] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRequest, setNewRequest] = useState(DEFAULT_REQUEST);
  const [newAssertions, setNewAssertions] = useState(DEFAULT_ASSERTIONS);

  const [detailDraft, setDetailDraft] = useState({
    caseId: "",
    values: null,
  });

  const projectQuery = useProject(projectId);
  const reportQuery = useDiffReport(projectId, reportId);
  const activeSpecVersionId = isCoverageView
    ? reportQuery.data?.baselineVersionId
    : specVersionId;

  const operationsQuery = useSpecificationOperations(
    isCoverageView ? null : activeSpecVersionId
  );
  const testCasesQuery = useTestCases(
    isCoverageView ? null : activeSpecVersionId
  );

  const createMutation = useCreateTestCase();
  const updateMutation = useUpdateTestCase();
  const approveMutation = useApproveTestCase();
  const archiveMutation = useArchiveTestCase();

  const testCases = testCasesQuery.data ?? EMPTY_ARRAY;
  const operations = operationsQuery.data?.operations ?? EMPTY_ARRAY;

  const getOperations = useMemo(
    () => operations.filter((operation) =>
      operation.kind === "path" && String(operation.method).toUpperCase() === "GET"
    ),
    [operations]
  );

  const selectedCase =
    testCases.find((testCase) => testCase.id === selectedCaseId) ??
    testCases[0] ??
    null;

  const activeSelectedCaseId = selectedCase?.id ?? "";

  const initialDetailForm = useMemo(
    () => selectedCase
      ? createDetailForm(selectedCase)
      : {
          title: "",
          description: "",
          request: DEFAULT_REQUEST,
          assertions: DEFAULT_ASSERTIONS,
        },
    [selectedCase]
  );

  const detailForm =
    detailDraft.caseId === activeSelectedCaseId && detailDraft.values
      ? detailDraft.values
      : initialDetailForm;

  const updateDetailForm = (updater) => {
    if (!selectedCase) return;

    setDetailDraft((current) => {
      const currentValues =
        current.caseId === selectedCase.id && current.values
          ? current.values
          : createDetailForm(selectedCase);

      return {
        caseId: selectedCase.id,
        values: typeof updater === "function"
          ? updater(currentValues)
          : updater,
      };
    });
  };

  const filteredCases = useMemo(() => {
    if (filter === "ALL") return testCases;
    return testCases.filter((testCase) => testCase.status === filter);
  }, [filter, testCases]);

  const selectedOperation = getOperations.find(
    (operation) => operation.operationKey === newOperationKey
  ) ?? getOperations[0] ?? null;

  const handleCreate = async (event) => {
    event.preventDefault();
    setFormError("");

    if (!selectedOperation) {
      setFormError("Choose a supported GET operation first.");
      return;
    }

    try {
      const request = parseJsonObject(newRequest, "Request inputs");
      const assertions = parseJsonObject(newAssertions, "Assertions");

      if (!newTitle.trim()) {
        throw new Error("Enter a title for this test case.");
      }

      const created = await createMutation.mutateAsync({
        specVersionId: activeSpecVersionId,
        operationKey: selectedOperation.operationKey,
        operationPath: selectedOperation.path,
        title: newTitle.trim(),
        description: newDescription.trim(),
        request,
        assertions,
      });

      setSelectedCaseId(created.id);
      setDetailError("");
      setShowCreate(false);
      setNewTitle("");
      setNewDescription("");
      setNewRequest(DEFAULT_REQUEST);
      setNewAssertions(DEFAULT_ASSERTIONS);
    } catch (error) {
      setFormError(error.message || "The test case could not be created.");
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedCase) return;
    setDetailError("");

    try {
      await updateMutation.mutateAsync({
        testCaseId: selectedCase.id,
        title: detailForm.title.trim(),
        description: detailForm.description.trim(),
        request: parseJsonObject(detailForm.request, "Request inputs"),
        assertions: parseJsonObject(detailForm.assertions, "Assertions"),
      });
    } catch (error) {
      setDetailError(error.message || "The test case could not be saved.");
    }
  };

  const handleApprove = async () => {
    if (!selectedCase) return;
    setDetailError("");

    try {
      await approveMutation.mutateAsync(selectedCase.id);
    } catch (error) {
      setDetailError(error.message || "The test case could not be approved.");
    }
  };

  const handleArchive = async () => {
    if (!selectedCase) return;
    setDetailError("");

    try {
      await archiveMutation.mutateAsync(selectedCase.id);
    } catch (error) {
      setDetailError(error.message || "The test case could not be archived.");
    }
  };

  if (projectQuery.isPending || (isCoverageView && reportQuery.isPending)) {
    return (
      <section className="test-cases-page">
        <div className="test-case-loading">
          <span className="spinner" />
          Preparing test-case workspace...
        </div>
      </section>
    );
  }

  if (projectQuery.isError) {
    return (
      <section className="test-cases-page">
        <Link to="/projects" className="back-link">
          <ArrowLeft size={16} /> All projects
        </Link>
        <QueryError error={projectQuery.error} onRetry={() => projectQuery.refetch()} />
      </section>
    );
  }

  if (isCoverageView && reportQuery.isError) {
    return (
      <section className="test-cases-page">
        <Link to={`/projects/${encodeURIComponent(projectId)}`} className="back-link">
          <ArrowLeft size={16} /> Back to project
        </Link>
        <QueryError error={reportQuery.error} onRetry={() => reportQuery.refetch()} />
      </section>
    );
  }

  if (testCasesQuery.isError) {
    return (
      <section className="test-cases-page">
        <QueryError error={testCasesQuery.error} onRetry={() => testCasesQuery.refetch()} />
      </section>
    );
  }

  const projectName = projectQuery.data?.name || "Project";
  const report = reportQuery.data;
  const coverageSummary = report?.coverageSummary ?? EMPTY_OBJECT;
  const changes = report?.changes ?? EMPTY_ARRAY;
  const operationsLoading = !isCoverageView && operationsQuery.isPending;

  if (isCoverageView) {
    return (
      <section className="test-cases-page">
        <div className="test-case-topline">
          <Link to={`/projects/${encodeURIComponent(projectId)}/diff-reports/${encodeURIComponent(reportId)}`} className="back-link">
            <ArrowLeft size={16} /> Comparison report
          </Link>
          <span>{projectName}</span>
        </div>

        <header className="test-case-page-header">
          <div className="test-case-page-icon"><GitCompareArrows size={23} /></div>
          <div>
            <span className="eyebrow">COMPARISON TRACEABILITY</span>
            <h1>Test coverage projection</h1>
            <p>
              Coverage links changed contract areas to cases saved against the comparison's baseline version.
            </p>
          </div>
          {activeSpecVersionId && (
            <Link
              className="button button-primary"
              to={`/projects/${encodeURIComponent(projectId)}/specifications/${encodeURIComponent(activeSpecVersionId)}/test-cases`}
            >
              <ClipboardCheck size={15} /> Open test library
            </Link>
          )}
        </header>

        <div className="test-case-context-strip">
          <div><span>Baseline</span><strong>{report?.baselineLabel || "Baseline specification"}</strong></div>
          <div><span>Candidate</span><strong>{report?.candidateLabel || "Candidate specification"}</strong></div>
          <div><span>Coverage basis</span><strong>Approved baseline cases</strong></div>
        </div>

        <div className="coverage-summary-grid">
          <div><span>Covered changes</span><strong>{coverageSummary.coveredChanges ?? 0}</strong></div>
          <div><span>Draft-only changes</span><strong>{coverageSummary.draftOnlyChanges ?? 0}</strong></div>
          <div><span>Uncovered changes</span><strong>{coverageSummary.uncoveredChanges ?? 0}</strong></div>
          <div><span>Unmapped changes</span><strong>{coverageSummary.unmappedChanges ?? 0}</strong></div>
        </div>

        <div className="test-case-information-note">
          <Info size={16} />
          <p>
            Coverage is traceability, not a test result. A change is covered only when every affected baseline operation has an approved case. No test has been executed by this view.
          </p>
        </div>

        <div className="coverage-change-list">
          {changes.length === 0 ? (
            <div className="test-case-empty-state">
              <CheckCircle2 size={24} />
              <h2>No comparison changes</h2>
              <p>This report contains no findings to map to baseline test cases.</p>
            </div>
          ) : changes.map((change, index) => (
            <CoverageChange key={change.changeId || `${change.field}-${index}`} change={change} />
          ))}
        </div>
      </section>
    );
  }

  const hasPendingQuery = testCasesQuery.isPending || operationsLoading;

  if (hasPendingQuery) {
    return (
      <section className="test-cases-page">
        <div className="test-case-loading">
          <span className="spinner" /> Loading baseline test cases...
        </div>
      </section>
    );
  }

  if (operationsQuery.isError) {
    return (
      <section className="test-cases-page">
        <QueryError error={operationsQuery.error} onRetry={() => operationsQuery.refetch()} />
      </section>
    );
  }

  return (
    <section className="test-cases-page">
      <div className="test-case-topline">
        <Link
          to={`/projects/${encodeURIComponent(projectId)}/specifications/${encodeURIComponent(activeSpecVersionId)}/explorer`}
          className="back-link"
        >
          <ArrowLeft size={16} /> API Explorer
        </Link>
        <span>{projectName}</span>
      </div>

      <header className="test-case-page-header">
        <div className="test-case-page-icon"><ClipboardCheck size={23} /></div>
        <div>
          <span className="eyebrow">BASELINE TEST LIBRARY</span>
          <h1>Test cases</h1>
          <p>
            Create and maintain bounded request inputs and response assertions for GET operations in this immutable specification version.
          </p>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            setFormError("");
            setShowCreate((value) => !value);
          }}
          disabled={getOperations.length === 0}
        >
          <FilePlus2 size={15} /> New test case
        </button>
      </header>

      <div className="test-case-context-strip">
        <div><span>Specification</span><strong>{operationsQuery.data?.specification?.label || "Baseline version"}</strong></div>
        <div><span>Supported operations</span><strong>{getOperations.length} GET path operations</strong></div>
        <div><span>Saved cases</span><strong>{testCases.length} / 500</strong></div>
      </div>

      <div className="test-case-information-note">
        <ShieldAlert size={16} />
        <p>
          Cases are anchored to this baseline version. Only path and query inputs are stored; the client cannot supply a host, target URL, headers, credentials, or request body. Approval is required before a case can become eligible for execution.
        </p>
      </div>

      {showCreate && (
        <form className="test-case-create-panel" onSubmit={handleCreate}>
          <div className="test-case-panel-heading">
            <div>
              <span className="eyebrow">NEW MANUAL CASE</span>
              <h2>Create a test case</h2>
              <p>Choose a baseline GET operation and provide JSON request inputs and assertions.</p>
            </div>
            <button type="button" className="test-case-close-button" onClick={() => setShowCreate(false)}>Close</button>
          </div>

          <div className="test-case-form-grid">
            <Field label="Baseline GET operation">
              <select value={selectedOperation?.operationKey || ""} onChange={(event) => setNewOperationKey(event.target.value)} required>
                {getOperations.map((operation) => (
                  <option key={operation.operationKey} value={operation.operationKey}>
                    {operation.method} {operation.path}{operation.summary ? ` â€” ${operation.summary}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Test-case title">
              <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={120} placeholder="e.g. Retrieve an existing record" required />
            </Field>
            <Field label="Description" hint="Optional Â· up to 1,000 characters">
              <input value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={1000} placeholder="What behavior does this case verify?" />
            </Field>
            <div className="test-case-form-wide">
              <Field label="Request inputs (JSON)" hint="Only pathParams and queryParams are accepted. Every required path and query parameter needs a value.">
                <textarea rows={7} spellCheck="false" value={newRequest} onChange={(event) => setNewRequest(event.target.value)} />
              </Field>
            </div>
            <div className="test-case-form-wide">
              <Field label="Response assertions (JSON)" hint="Supports expectedStatus, requiredProperties, and VALUE/PRESENCE propertyAssertions.">
                <textarea rows={7} spellCheck="false" value={newAssertions} onChange={(event) => setNewAssertions(event.target.value)} />
              </Field>
            </div>
          </div>

          {formError && <p className="test-case-form-error" role="alert">{formError}</p>}

          <div className="test-case-form-actions">
            <button type="button" className="button button-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={createMutation.isPending || !selectedOperation}>
              <FilePlus2 size={15} /> {createMutation.isPending ? "Creating..." : "Create draft"}
            </button>
          </div>
        </form>
      )}

      <div className="test-case-workspace-grid">
        <section className="test-case-library-panel">
          <div className="test-case-library-heading">
            <div>
              <span className="eyebrow">CASE LIBRARY</span>
              <h2>Saved test cases</h2>
            </div>
            <span className="test-case-count">{testCases.length}</span>
          </div>

          <div className="test-case-filters" role="group" aria-label="Filter test cases">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.value}
                className={filter === item.value ? "is-active" : ""}
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="test-case-list">
            {filteredCases.length === 0 ? (
              <div className="test-case-list-empty">
                <ClipboardCheck size={22} />
                <strong>{testCases.length ? "No cases in this filter" : "No test cases yet"}</strong>
                <p>{testCases.length ? "Choose another status filter." : "Create a manual case to start building baseline traceability."}</p>
              </div>
            ) : filteredCases.map((testCase) => (
              <TestCaseListItem
                key={testCase.id}
                testCase={testCase}
                selected={activeSelectedCaseId === testCase.id}
                onSelect={() => {
                  setSelectedCaseId(testCase.id);
                  setDetailError("");
                }}
              />
            ))}
          </div>
        </section>

        <section className="test-case-detail-panel">
          {!selectedCase ? (
            <div className="test-case-detail-empty">
              <ClipboardCheck size={27} />
              <h2>Select a test case</h2>
              <p>Choose a case from the library to review its baseline operation, inputs, assertions, and lifecycle state.</p>
            </div>
          ) : (
            <>
              <div className="test-case-detail-heading">
                <div>
                  <span className="eyebrow">TEST CASE DETAIL</span>
                  <h2>{selectedCase.title}</h2>
                </div>
                <StatusBadge status={selectedCase.status} />
              </div>

              <div className="test-case-operation-block">
                <span>BASELINE OPERATION</span>
                <strong>GET {selectedCase.operationPath}</strong>
                <code>{selectedCase.operationKey}</code>
                <small>Created {formatDate(selectedCase.createdAt)} Â· Updated {formatDate(selectedCase.updatedAt)}</small>
              </div>

              <form className="test-case-detail-form" onSubmit={handleSave}>
                <Field label="Title">
                  <input
                    value={detailForm.title}
                    onChange={(event) => updateDetailForm((current) => ({ ...current, title: event.target.value }))}
                    maxLength={120}
                    disabled={selectedCase.status !== "DRAFT"}
                    required
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    rows={3}
                    value={detailForm.description}
                    onChange={(event) => updateDetailForm((current) => ({ ...current, description: event.target.value }))}
                    maxLength={1000}
                    disabled={selectedCase.status !== "DRAFT"}
                  />
                </Field>
                <Field label="Request inputs (JSON)">
                  <textarea
                    rows={7}
                    spellCheck="false"
                    value={detailForm.request}
                    onChange={(event) => updateDetailForm((current) => ({ ...current, request: event.target.value }))}
                    disabled={selectedCase.status !== "DRAFT"}
                  />
                </Field>
                <Field label="Response assertions (JSON)">
                  <textarea
                    rows={7}
                    spellCheck="false"
                    value={detailForm.assertions}
                    onChange={(event) => updateDetailForm((current) => ({ ...current, assertions: event.target.value }))}
                    disabled={selectedCase.status !== "DRAFT"}
                  />
                </Field>

                {detailError && <p className="test-case-form-error" role="alert">{detailError}</p>}

                <div className="test-case-detail-actions">
                  {selectedCase.status === "DRAFT" && (
                    <>
                      <button type="submit" className="button button-secondary" disabled={updateMutation.isPending}>
                        <Save size={15} /> {updateMutation.isPending ? "Saving..." : "Save draft"}
                      </button>
                      <button type="button" className="button button-primary" onClick={handleApprove} disabled={approveMutation.isPending}>
                        <Check size={15} /> {approveMutation.isPending ? "Approving..." : "Approve case"}
                      </button>
                    </>
                  )}
                  {selectedCase.status !== "ARCHIVED" && (
                    <button type="button" className="button button-danger-quiet" onClick={handleArchive} disabled={archiveMutation.isPending}>
                      <Archive size={15} /> {archiveMutation.isPending ? "Archiving..." : "Archive"}
                    </button>
                  )}
                </div>
              </form>

              {selectedCase.status === "APPROVED" && (
                <div className="test-case-readonly-note">
                  <CheckCircle2 size={15} /> Approved cases are immutable. Create a new draft to make corrections.
                </div>
              )}
              {selectedCase.status === "ARCHIVED" && (
                <div className="test-case-readonly-note is-muted">
                  <Archive size={15} /> Archived cases are read-only and excluded from coverage.
                </div>
              )}
              {selectedCase.approvedAt && (
                <p className="test-case-approved-meta">Approved {formatDate(selectedCase.approvedAt)}</p>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
};

export default TestCasesPage;
