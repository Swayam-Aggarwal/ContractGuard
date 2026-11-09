
import { useState } from "react";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GitCompareArrows,
  History,
  Layers3,
  Play,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  useProject,
} from "../features/projects/projects.js";

import {
  useSpecificationVersions,
} from "../features/specifications/specifications.js";

import {
  useCreateDiffReport,
  useDiffReports,
} from "../features/comparisons/diffReports.js";

import "./ComparisonPages.css";

const EMPTY_ARRAY = Object.freeze([]);

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const AnalysisStatus = ({ status }) => {
  const complete = status === "COMPLETE";

  return (
    <span className={`comparison-status ${complete ? "is-complete" : "is-partial"}`}>
      {complete ? (
        <ShieldCheck size={14} />
      ) : (
        <ShieldAlert size={14} />
      )}

      {complete ? "Analysis complete" : status || "Partial analysis"}
    </span>
  );
};

const ReportSummary = ({ summary }) => (
  <div className="comparison-history-metrics">
    <span>
      <strong>{summary?.totalChanges ?? 0}</strong>
      total changes
    </span>

    <span className="metric-breaking">
      <strong>{summary?.breakingChanges ?? 0}</strong>
      breaking
    </span>

    <span className="metric-nonbreaking">
      <strong>{summary?.nonBreakingChanges ?? 0}</strong>
      non-breaking
    </span>

    <span className="metric-info">
      <strong>{summary?.informationalChanges ?? 0}</strong>
      informational
    </span>
  </div>
);

const ComparisonPage = () => {
  const { projectId } = useParams();

  const navigate = useNavigate();

  const [selectedBaselineId, setSelectedBaselineId] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");

  const projectQuery = useProject(projectId);
  const versionsQuery = useSpecificationVersions(projectId);
  const reportsQuery = useDiffReports(projectId);

  const createMutation = useCreateDiffReport();

  const versions = versionsQuery.data ?? EMPTY_ARRAY;
  const reports = reportsQuery.data ?? EMPTY_ARRAY;

  // The API returns versions newest first.
  const defaultCandidate = versions[0];

  const defaultBaseline =
    versions.length > 1
      ? versions[versions.length - 1]
      : null;

  const baselineId =
    selectedBaselineId || defaultBaseline?.id || "";

  const candidateId =
    selectedCandidateId || defaultCandidate?.id || "";

  const baselineVersion = versions.find(
    (version) => version.id === baselineId
  );

  const candidateVersion = versions.find(
    (version) => version.id === candidateId
  );

  const sameVersion =
    Boolean(baselineId && candidateId) &&
    baselineId === candidateId;

  const canCompare =
    versions.length >= 2 &&
    Boolean(baselineId) &&
    Boolean(candidateId) &&
    !sameVersion;

  const handleCompare = async (event) => {
    event.preventDefault();

    if (!canCompare || createMutation.isPending) {
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        projectId,
        baselineSpecVersionId: baselineId,
        candidateSpecVersionId: candidateId,
      });

      navigate(
        `/projects/${encodeURIComponent(projectId)}/diff-reports/${encodeURIComponent(result.diffReport.id)}`
      );
    } catch {
      // Mutation error is displayed in the form.
    }
  };

  if (projectQuery.isPending || versionsQuery.isPending) {
    return (
      <section className="comparison-page">
        <div className="comparison-loading">
          <span className="spinner" />
          Loading comparison workspace...
        </div>
      </section>
    );
  }

  if (projectQuery.isError || versionsQuery.isError) {
    const error = projectQuery.error || versionsQuery.error;

    return (
      <section className="comparison-page">
        <Link
          to={`/projects/${encodeURIComponent(projectId)}`}
          className="back-link"
        >
          <ArrowLeft size={16} />
          Back to project
        </Link>

        <div className="comparison-error-panel" role="alert">
          <AlertCircle size={20} />

          <div>
            <strong>Couldn't load comparison workspace</strong>
            <p>{error.message}</p>
          </div>
        </div>
      </section>
    );
  }

  const project = projectQuery.data;

  return (
    <section className="comparison-page">
      <div className="comparison-breadcrumb">
        <Link
          to={`/projects/${encodeURIComponent(projectId)}`}
          className="back-link"
        >
          <ArrowLeft size={16} />
          {project.name}
        </Link>

        <span>/</span>
        <span>Comparisons</span>
      </div>

      <header className="comparison-page-header">
        <div className="comparison-page-title">
          <div className="comparison-page-icon">
            <GitCompareArrows size={23} />
          </div>

          <div>
            <span className="eyebrow">
              CONTRACT ANALYSIS
            </span>

            <h1>Version comparisons</h1>

            <p>
              Compare two specification versions and review the contract changes detected by ContractGuard.
            </p>
          </div>
        </div>
      </header>

      <section className="comparison-create-panel">
        <div className="comparison-panel-heading">
          <div>
            <span className="eyebrow">NEW ANALYSIS</span>
            <h2>Compare specification versions</h2>

            <p>
              Select a baseline contract and the candidate contract that replaces it.
            </p>
          </div>

          <span className="comparison-direction-label">
            Baseline <ArrowRight size={13} /> Candidate
          </span>
        </div>

        {versions.length < 2 ? (
          <div className="comparison-insufficient-versions">
            <div className="comparison-insufficient-icon">
              <Layers3 size={21} />
            </div>

            <div>
              <strong>Two specification versions are required</strong>

              <p>
                Upload another version before creating a comparison.
              </p>

              <Link
                className="button button-primary"
                to={`/projects/${encodeURIComponent(projectId)}`}
              >
                Go to specifications
              </Link>
            </div>
          </div>
        ) : (
          <form
            className="comparison-version-form"
            onSubmit={handleCompare}
          >
            <div className="comparison-version-selector">
              <div className="comparison-selector-top">
                <span className="comparison-selector-number">
                  01
                </span>

                <div>
                  <label htmlFor="baseline-version">
                    Baseline version
                  </label>

                  <span>
                    The existing contract used by consumers
                  </span>
                </div>
              </div>

              <select
                id="baseline-version"
                value={baselineId}
                onChange={(event) => {
                  setSelectedBaselineId(event.target.value);
                  createMutation.reset();
                }}
              >
                {versions.map((version) => (
                  <option value={version.id} key={version.id}>
                    {version.label} — OpenAPI {version.openapiVersion}
                  </option>
                ))}
              </select>

              {baselineVersion && (
                <div className="comparison-version-meta">
                  <span>{baselineVersion.title}</span>

                  <span>
                    {baselineVersion.operationCount} operations
                  </span>
                </div>
              )}
            </div>

            <div className="comparison-version-connector">
              <ArrowRight size={19} />
            </div>

            <div className="comparison-version-selector">
              <div className="comparison-selector-top">
                <span className="comparison-selector-number">
                  02
                </span>

                <div>
                  <label htmlFor="candidate-version">
                    Candidate version
                  </label>

                  <span>
                    The updated contract being assessed
                  </span>
                </div>
              </div>

              <select
                id="candidate-version"
                value={candidateId}
                onChange={(event) => {
                  setSelectedCandidateId(event.target.value);
                  createMutation.reset();
                }}
              >
                {versions.map((version) => (
                  <option value={version.id} key={version.id}>
                    {version.label} — OpenAPI {version.openapiVersion}
                  </option>
                ))}
              </select>

              {candidateVersion && (
                <div className="comparison-version-meta">
                  <span>{candidateVersion.title}</span>

                  <span>
                    {candidateVersion.operationCount} operations
                  </span>
                </div>
              )}
            </div>

            {sameVersion && (
              <div className="comparison-form-message is-error" role="alert">
                <AlertCircle size={15} />
                Choose two different specification versions.
              </div>
            )}

            {createMutation.isError && (
              <div className="comparison-form-message is-error" role="alert">
                <AlertCircle size={15} />

                <div>
                  <strong>{createMutation.error.message}</strong>

                  {createMutation.error.details?.length > 0 && (
                    <ul>
                      {createMutation.error.details.map((detail, index) => (
                        <li key={`${detail.field || "error"}-${index}`}>
                          {detail.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <div className="comparison-form-footer">
              <div className="comparison-direction-note">
                <CheckCircle2 size={15} />

                <span>
                  Consumer compatibility: baseline → candidate
                </span>
              </div>

              <button
                className="button button-primary comparison-submit"
                type="submit"
                disabled={!canCompare || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <span className="spinner spinner-light" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    Run comparison
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="comparison-history-panel">
        <div className="comparison-history-heading">
          <div>
            <span className="eyebrow">SAVED ANALYSIS</span>
            <h2>Comparison history</h2>

            <p>
              Previously generated reports for this project.
            </p>
          </div>

          <span className="comparison-history-count">
            {reports.length} {reports.length === 1 ? "report" : "reports"}
          </span>
        </div>

        {reportsQuery.isPending ? (
          <div className="comparison-loading">
            <span className="spinner" />
            Loading comparison history...
          </div>
        ) : reportsQuery.isError ? (
          <div className="comparison-error-panel" role="alert">
            <AlertCircle size={18} />

            <div>
              <strong>Couldn't load comparison history</strong>
              <p>{reportsQuery.error.message}</p>

              <button
                type="button"
                className="comparison-text-button"
                onClick={() => reportsQuery.refetch()}
              >
                Try again
              </button>
            </div>
          </div>
        ) : reports.length === 0 ? (
          <div className="comparison-history-empty">
            <div className="comparison-history-empty-icon">
              <History size={23} />
            </div>

            <h3>No comparison reports yet</h3>

            <p>
              Your first comparison report will appear here after you analyze two specification versions.
            </p>
          </div>
        ) : (
          <div className="comparison-history-list">
            {reports.map((report) => (
              <Link
                className="comparison-history-row"
                key={report.id}
                to={`/projects/${encodeURIComponent(projectId)}/diff-reports/${encodeURIComponent(report.id)}`}
              >
                <div className="comparison-history-icon">
                  <GitCompareArrows size={18} />
                </div>

                <div className="comparison-history-main">
                  <div className="comparison-history-title">
                    <strong>
                      {report.baselineLabel}
                      <ArrowRight size={14} />
                      {report.candidateLabel}
                    </strong>

                    <AnalysisStatus status={report.analysisStatus} />
                  </div>

                  <ReportSummary summary={report.summary} />
                </div>

                <div className="comparison-history-date">
                  {formatDate(report.createdAt)}
                </div>

                <ArrowRight
                  className="comparison-history-arrow"
                  size={17}
                />
              </Link>
            ))}
          </div>
        )}
      </section>
    </section>
  );
};

export default ComparisonPage;
