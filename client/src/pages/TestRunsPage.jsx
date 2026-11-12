import { useMemo, useState } from "react";

import { Link, useParams } from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FlaskConical,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useProject } from "../features/projects/projects.js";
import { useDiffReport } from "../features/comparisons/diffReports.js";
import { useTestCases } from "../features/testCases.js";

import {
  useCreateTestRun,
  useTestRun,
  useTestRuns,
} from "../features/testRuns.js";

import "./TestRunsPage.css";

const EMPTY_ARRAY = Object.freeze([]);

const RUN_STATUS_LABELS = {
  QUEUED: "Queued",
  RUNNING: "Running",
  PASSED: "Passed",
  FAILED: "Failed",
  PARTIAL: "Partial",
  INTERRUPTED: "Interrupted",
};

const RESULT_STATUS_LABELS = {
  PASSED: "Passed",
  FAILED: "Failed",
  SKIPPED: "Skipped",
  UNSUPPORTED: "Unsupported",
  ERROR: "Error",
};

const formatDate = (value) => {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatDuration = (value) => {
  const duration = Number(value);

  if (!Number.isFinite(duration) || duration < 0) {
    return "—";
  }

  return duration < 1000
    ? `${Math.round(duration)} ms`
    : `${(duration / 1000).toFixed(2)} s`;
};

const statusClass = (status) =>
  String(status || "unknown").toLowerCase();

const RunStatus = ({ status }) => (
  <span className={`test-run-status test-run-status-${statusClass(status)}`}>
    {RUN_STATUS_LABELS[status] || status || "Unknown"}
  </span>
);

const ResultStatus = ({ status }) => (
  <span className={`test-run-result-status test-run-result-status-${statusClass(status)}`}>
    {RESULT_STATUS_LABELS[status] || status || "Unknown"}
  </span>
);

const LoadingState = ({
  label = "Loading regression data...",
}) => (
  <div
    className="test-runs-loading"
    role="status"
    aria-live="polite"
  >
    <LoaderCircle size={19} className="test-runs-spin" />
    <span>{label}</span>
  </div>
);

const ErrorState = ({
  title,
  message,
  onRetry,
}) => (
  <div className="test-runs-error" role="alert">
    <AlertCircle size={19} />

    <div>
      <strong>{title}</strong>

      <p>{message || "The request could not be completed."}</p>

      {onRetry && (
        <button
          type="button"
          className="test-runs-text-button"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  </div>
);

const SummaryMetric = ({
  label,
  value,
  tone = "neutral",
}) => (
  <div className={`test-run-metric test-run-metric-${tone}`}>
    <span>{label}</span>
    <strong>{value ?? 0}</strong>
  </div>
);

const ValidationPanel = ({
  title,
  validation,
}) => {
  if (!validation) return null;

  const valid = validation.valid === true;
  const hasIssues = (validation.errors?.length || 0) > 0;
  const warnings = validation.warnings ?? EMPTY_ARRAY;

  return (
    <section className="test-run-validation-panel">
      <div className="test-run-validation-heading">
        <div>
          <strong>{title}</strong>

          <span>
            {validation.status === "READY"
              ? valid
                ? "Schema valid"
                : "Schema validation failed"
              : validation.status === "NOT_CHECKED"
                ? "Not checked"
                : validation.status || "Unknown"}
          </span>
        </div>

        {validation.status === "READY" && valid ? (
          <CheckCircle2
            size={18}
            className="test-run-icon-success"
          />
        ) : validation.status === "NOT_CHECKED" ? (
          <Clock3
            size={18}
            className="test-run-icon-muted"
          />
        ) : (
          <ShieldAlert
            size={18}
            className="test-run-icon-warning"
          />
        )}
      </div>

      {hasIssues && (
        <div className="test-run-diagnostic-list">
          {validation.errors.map((entry, index) => (
            <div
              className="test-run-diagnostic"
              key={`${entry.keyword}-${index}`}
            >
              <code>
                {entry.instancePath ||
                  entry.schemaPath ||
                  entry.keyword}
              </code>

              <p>{entry.message}</p>
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="test-run-warning-list">
          {warnings.map((entry, index) => (
            <p key={`${entry.keyword}-${index}`}>
              {entry.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
};

const TestResultCard = ({ result }) => (
  <article className="test-run-result-card">
    <div className="test-run-result-card-heading">
      <div className="test-run-result-title">
        <strong>{result.title}</strong>

        <span>
          <code>GET</code>
          <code>{result.operationPath}</code>
        </span>
      </div>

      <ResultStatus status={result.status} />
    </div>

    <div className="test-run-result-meta">
      <span>
        HTTP {result.actualStatus ?? "—"}
        {result.expectedStatus
          ? ` / expected ${result.expectedStatus}`
          : ""}
      </span>

      <span>{formatDuration(result.durationMs)}</span>
    </div>

    {result.errorMessage && (
      <div className="test-run-result-message" role="note">
        <AlertCircle size={15} />
        <span>{result.errorMessage}</span>
      </div>
    )}

    <div className="test-run-validation-grid">
      <ValidationPanel
        title="Candidate contract"
        validation={result.candidateSchemaValidation}
      />

      <ValidationPanel
        title="Baseline contract"
        validation={result.baselineSchemaValidation}
      />
    </div>

    {result.assertions?.length > 0 && (
      <details
        className="test-run-assertions"
        open={result.status !== "PASSED"}
      >
        <summary>
          Assertions

          <span>
            {result.assertions.filter(
              (entry) => entry.passed
            ).length}/{result.assertions.length} passed
          </span>
        </summary>

        <div className="test-run-assertion-list">
          {result.assertions.map((assertion, index) => (
            <div
              className="test-run-assertion"
              key={`${assertion.kind}-${assertion.path || "status"}-${index}`}
            >
              {assertion.passed ? (
                <CheckCircle2
                  size={15}
                  className="test-run-icon-success"
                />
              ) : (
                <XCircle
                  size={15}
                  className="test-run-icon-danger"
                />
              )}

              <div>
                <strong>
                  {assertion.path || "Expected HTTP status"}
                </strong>

                <p>{assertion.message}</p>
              </div>
            </div>
          ))}
        </div>
      </details>
    )}

    {result.responsePreview && (
      <details className="test-run-evidence">
        <summary>
          Candidate response evidence

          {result.responseBodyTruncated && (
            <span>Preview truncated</span>
          )}
        </summary>

        <pre>{result.responsePreview}</pre>
      </details>
    )}
  </article>
);

const TestRunsPage = () => {
  const { projectId, reportId } = useParams();

  const [selectedTestCaseIds, setSelectedTestCaseIds] =
    useState([]);

  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [actionError, setActionError] = useState("");

  const projectQuery = useProject(projectId);
  const reportQuery = useDiffReport(projectId, reportId);

  const baselineVersionId =
    reportQuery.data?.baselineVersionId;

  const testCasesQuery = useTestCases(baselineVersionId);
  const testRunsQuery = useTestRuns(projectId, reportId);
  const createRunMutation = useCreateTestRun();

  const executionEligibility =
    testRunsQuery.data?.executionEligibility;

  const supportedOperationKeys = useMemo(
    () =>
      new Set(
        (
          executionEligibility?.supportedOperations ?? []
        ).map((entry) => entry.operationKey)
      ),
    [executionEligibility?.supportedOperations]
  );

  const approvedManualCases = useMemo(
    () =>
      (testCasesQuery.data ?? EMPTY_ARRAY).filter(
        (testCase) =>
          testCase.status === "APPROVED" &&
          testCase.source === "MANUAL"
      ),
    [testCasesQuery.data]
  );

  const latestRunId =
    testRunsQuery.data?.testRuns?.[0]?.id ?? "";

  const activeRunId = selectedRunId || latestRunId;

  const activeRunQuery = useTestRun(
    projectId,
    reportId,
    activeRunId
  );

  const activeRun = activeRunQuery.data;
  const runHistory = testRunsQuery.data?.testRuns ?? EMPTY_ARRAY;

  const reportPath =
    `/projects/${encodeURIComponent(projectId)}/diff-reports/${encodeURIComponent(reportId)}`;

  const coveragePath = `${reportPath}/coverage`;

  const handleToggleCase = (testCaseId) => {
    setSelectionError("");
    setActionError("");

    if (selectedTestCaseIds.includes(testCaseId)) {
      setSelectedTestCaseIds((current) =>
        current.filter((id) => id !== testCaseId)
      );

      return;
    }

    if (selectedTestCaseIds.length >= 20) {
      setSelectionError(
        "A regression run can contain at most 20 test cases."
      );

      return;
    }

    setSelectedTestCaseIds((current) =>
      current.includes(testCaseId)
        ? current
        : [...current, testCaseId]
    );
  };

  const handleStartRun = async () => {
    setActionError("");
    setSelectionError("");

    try {
      const created = await createRunMutation.mutateAsync({
        projectId,
        reportId,
        testCaseIds: selectedTestCaseIds,
      });

      setSelectedRunId(created.id);
      setSelectedTestCaseIds([]);
    } catch (error) {
      setActionError(
        error.message || "The regression run could not be started."
      );
    }
  };

  const handleSelectRun = (testRunId) => {
    setSelectedRunId(testRunId);
    setActionError("");
  };

  if (projectQuery.isLoading || reportQuery.isLoading) {
    return (
      <LoadingState label="Loading comparison and project..." />
    );
  }

  if (projectQuery.isError) {
    return (
      <ErrorState
        title="Unable to load project"
        message={projectQuery.error.message}
        onRetry={projectQuery.refetch}
      />
    );
  }

  if (reportQuery.isError) {
    return (
      <ErrorState
        title="Unable to load comparison"
        message={reportQuery.error.message}
        onRetry={reportQuery.refetch}
      />
    );
  }

  return (
    <div className="test-runs-page">
      <div className="test-runs-page-header">
        <div>
          <Link
            to={reportPath}
            className="test-runs-back-link"
          >
            <ArrowLeft size={15} />
            Back to comparison
          </Link>

          <span className="eyebrow">
            PHASE 7 · REGRESSION EXECUTION
          </span>

          <h1>Regression runs</h1>

          <p>
            Execute approved baseline cases against the trusted bundled Demo Store V2 implementation.
          </p>
        </div>

        <div className="test-runs-header-actions">
          <Link
            to={coveragePath}
            className="test-runs-secondary-link"
          >
            View test coverage
          </Link>

          <button
            type="button"
            className="test-runs-icon-button"
            onClick={() => {
              testRunsQuery.refetch();

              if (activeRunId) {
                activeRunQuery.refetch();
              }
            }}
            disabled={
              testRunsQuery.isFetching ||
              activeRunQuery.isFetching
            }
            aria-label="Refresh regression run data"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <section className="test-runs-comparison-strip">
        <div>
          <span>Project</span>
          <strong>
            {projectQuery.data?.name || "Project"}
          </strong>
        </div>

        <div>
          <span>Baseline</span>
          <strong>
            {reportQuery.data?.baselineLabel || "Baseline version"}
          </strong>
        </div>

        <div>
          <span>Candidate</span>
          <strong>
            {reportQuery.data?.candidateLabel || "Candidate version"}
          </strong>
        </div>

        <div>
          <span>Comparison</span>
          <strong>
            {reportQuery.data?.rulesetVersion || "Compatibility report"}
          </strong>
        </div>
      </section>

      {testRunsQuery.isLoading ? (
        <LoadingState label="Checking execution eligibility..." />
      ) : testRunsQuery.isError ? (
        <ErrorState
          title="Unable to load regression history"
          message={testRunsQuery.error.message}
          onRetry={testRunsQuery.refetch}
        />
      ) : (
        <>
          {executionEligibility?.eligible ? (
            <section className="test-runs-eligibility is-eligible">
              <ShieldCheck size={18} />

              <div>
                <strong>Execution eligible</strong>

                <p>
                  The uploaded baseline and candidate match the trusted Demo Store V1 → V2 fixture pair.
                  Only the two registered GET operations can execute.
                </p>
              </div>
            </section>
          ) : (
            <section
              className="test-runs-eligibility is-ineligible"
              role="alert"
            >
              <ShieldAlert size={18} />

              <div>
                <strong>This comparison cannot be executed</strong>

                <p>
                  Only a complete comparison of the exact trusted Demo Store V1 and V2 fixtures is eligible.
                </p>

                {executionEligibility?.reasons?.length > 0 && (
                  <ul>
                    {executionEligibility.reasons.map(
                      (reason, index) => (
                        <li key={`${reason.code}-${index}`}>
                          {reason.message}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>
            </section>
          )}

          <div className="test-runs-main-grid">
            <section className="test-runs-panel test-runs-selection-panel">
              <div className="test-runs-panel-heading">
                <div>
                  <span className="eyebrow">
                    EXECUTION INPUT
                  </span>

                  <h2>Select approved test cases</h2>
                </div>

                <span className="test-runs-count-pill">
                  {selectedTestCaseIds.length}/20 selected
                </span>
              </div>

              <p className="test-runs-panel-description">
                Only manually authored, approved cases belonging to this comparison's exact baseline version can be selected.
              </p>

              {testCasesQuery.isLoading ? (
                <LoadingState label="Loading baseline test cases..." />
              ) : testCasesQuery.isError ? (
                <ErrorState
                  title="Unable to load baseline test cases"
                  message={testCasesQuery.error.message}
                  onRetry={testCasesQuery.refetch}
                />
              ) : approvedManualCases.length === 0 ? (
                <div className="test-runs-empty-selection">
                  <FlaskConical size={22} />

                  <strong>No approved manual test cases</strong>

                  <p>
                    Create and approve test cases for the baseline operations before starting a run.
                  </p>

                  <Link to={coveragePath}>
                    Open test coverage
                  </Link>
                </div>
              ) : (
                <div className="test-runs-case-list">
                  {approvedManualCases.map((testCase) => {
                    const supported =
                      supportedOperationKeys.has(testCase.operationKey);

                    const selected =
                      selectedTestCaseIds.includes(testCase.id);

                    const selectionLimitReached =
                      selectedTestCaseIds.length >= 20 && !selected;

                    return (
                      <label
                        className={`test-runs-case-option ${selected ? "is-selected" : ""} ${!supported ? "is-unsupported" : ""}`}
                        key={testCase.id}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={
                            !supported ||
                            selectionLimitReached ||
                            !executionEligibility?.eligible
                          }
                          onChange={() => handleToggleCase(testCase.id)}
                        />

                        <span className="test-runs-case-copy">
                          <strong>{testCase.title}</strong>

                          <span>
                            <code>GET</code>
                            <code>{testCase.operationPath}</code>
                          </span>

                          {!supported && (
                            <small>
                              This operation is not supported by the bundled runner.
                            </small>
                          )}
                        </span>

                        <span className="test-runs-approved-label">
                          Approved
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {selectionError && (
                <p className="test-runs-inline-error" role="alert">
                  {selectionError}
                </p>
              )}

              {actionError && (
                <p className="test-runs-inline-error" role="alert">
                  {actionError}
                </p>
              )}

              <div className="test-runs-selection-footer">
                <span>
                  Maximum 20 cases per run · GET operations only
                </span>

                <button
                  type="button"
                  className="test-runs-primary-button"
                  onClick={handleStartRun}
                  disabled={
                    !executionEligibility?.eligible ||
                    selectedTestCaseIds.length === 0 ||
                    createRunMutation.isPending
                  }
                >
                  {createRunMutation.isPending ? (
                    <LoaderCircle
                      size={16}
                      className="test-runs-spin"
                    />
                  ) : (
                    <Play size={15} />
                  )}

                  {createRunMutation.isPending
                    ? "Queueing run..."
                    : "Start regression run"}
                </button>
              </div>
            </section>

            <section className="test-runs-panel test-runs-history-panel">
              <div className="test-runs-panel-heading">
                <div>
                  <span className="eyebrow">
                    PERSISTED HISTORY
                  </span>

                  <h2>Previous runs</h2>
                </div>

                <span className="test-runs-history-count">
                  {runHistory.length}
                </span>
              </div>

              {runHistory.length === 0 ? (
                <div className="test-runs-empty-history">
                  <Clock3 size={22} />

                  <strong>No regression runs yet</strong>

                  <p>
                    Your run history will appear here after the first execution.
                  </p>
                </div>
              ) : (
                <div className="test-runs-history-list">
                  {runHistory.map((run) => (
                    <button
                      type="button"
                      className={`test-runs-history-item ${activeRunId === run.id ? "is-active" : ""}`}
                      key={run.id}
                      onClick={() => handleSelectRun(run.id)}
                    >
                      <div className="test-runs-history-item-heading">
                        <strong>{formatDate(run.createdAt)}</strong>
                        <RunStatus status={run.status} />
                      </div>

                      <span>
                        {run.summary?.total ??
                          run.selectedTestCaseIds?.length ??
                          0}{" "}
                        test cases
                        {run.summary
                          ? ` · ${run.summary.failed} failed · ${run.summary.passed} passed`
                          : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="test-runs-panel test-runs-detail-panel">
            <div className="test-runs-panel-heading">
              <div>
                <span className="eyebrow">
                  EXECUTION EVIDENCE
                </span>

                <h2>Run details</h2>
              </div>

              {activeRun && (
                <RunStatus status={activeRun.status} />
              )}
            </div>

            {!activeRunId ? (
              <div className="test-runs-empty-detail">
                <FlaskConical size={22} />

                <strong>Select a run or start a new one</strong>

                <p>
                  Run summaries, schema validation, assertions, and response evidence will appear here.
                </p>
              </div>
            ) : activeRunQuery.isLoading ? (
              <LoadingState label="Loading run details..." />
            ) : activeRunQuery.isError ? (
              <ErrorState
                title="Unable to load run details"
                message={activeRunQuery.error.message}
                onRetry={activeRunQuery.refetch}
              />
            ) : activeRun ? (
              <>
                {["QUEUED", "RUNNING"].includes(activeRun.status) && (
                  <div
                    className="test-runs-progress-note"
                    role="status"
                    aria-live="polite"
                  >
                    <LoaderCircle
                      size={17}
                      className="test-runs-spin"
                    />

                    <span>
                      {activeRun.status === "QUEUED"
                        ? "The run is waiting for an execution slot."
                        : "Test cases are being executed and results are being saved."}
                    </span>
                  </div>
                )}

                {activeRun.failureReason && (
                  <div
                    className="test-runs-inline-error"
                    role="alert"
                  >
                    {activeRun.failureReason}
                  </div>
                )}

                <div className="test-runs-run-meta">
                  <span>
                    Started {formatDate(activeRun.startedAt)}
                  </span>

                  <span>
                    Completed {formatDate(activeRun.completedAt)}
                  </span>

                  <span>
                    Target{" "}
                    {activeRun.executionTarget?.implementationVersion || "—"}
                  </span>
                </div>

                <div className="test-runs-metrics-grid">
                  <SummaryMetric
                    label="Total"
                    value={activeRun.summary?.total}
                  />

                  <SummaryMetric
                    label="Passed"
                    value={activeRun.summary?.passed}
                    tone="success"
                  />

                  <SummaryMetric
                    label="Failed"
                    value={activeRun.summary?.failed}
                    tone="danger"
                  />

                  <SummaryMetric
                    label="Unsupported"
                    value={activeRun.summary?.unsupported}
                    tone="warning"
                  />

                  <SummaryMetric
                    label="Skipped"
                    value={activeRun.summary?.skipped}
                  />

                  <SummaryMetric
                    label="Errors"
                    value={activeRun.summary?.errors}
                    tone="danger"
                  />
                </div>

                <div className="test-runs-results-heading">
                  <h3>Individual test results</h3>

                  <span>
                    {activeRun.results?.length ?? 0} completed
                  </span>
                </div>

                {activeRun.results?.length > 0 ? (
                  <div className="test-runs-results-list">
                    {activeRun.results.map((result, index) => (
                      <TestResultCard
                        result={result}
                        key={`${result.testCaseId}-${index}`}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="test-runs-empty-results">
                    No individual results have been persisted yet.
                  </div>
                )}
              </>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
};

const TestRunsPageRoute = () => {
  const { projectId, reportId } = useParams();

  return (
    <TestRunsPage key={`${projectId}:${reportId}`} />
  );
};

export default TestRunsPageRoute;