
import { useMemo, useState } from "react";

import {
  Link,
  useParams,
} from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Braces,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Code2,
  FileCode2,
  GitCompareArrows,
  Info,
  Layers3,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  useProject,
} from "../features/projects/projects.js";

import {
  useDiffReport,
} from "../features/comparisons/diffReports.js";

import "./ComparisonPages.css";

const EMPTY_ARRAY = Object.freeze([]);

const CLASSIFICATION_OPTIONS = [
  { value: "all", label: "All classifications" },
  { value: "BREAKING", label: "Breaking" },
  { value: "POTENTIALLY_BREAKING", label: "Potentially breaking" },
  { value: "NON_BREAKING", label: "Non-breaking" },
  { value: "INFORMATIONAL", label: "Informational" },
  { value: "UNSUPPORTED", label: "Unsupported" },
];

const CATEGORY_LABELS = {
  operation: "Operation",
  parameter: "Parameter",
  requestBody: "Request body",
  response: "Response",
  schema: "Schema",
  security: "Security",
  server: "Server",
  metadata: "Metadata",
};

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

const getChangeClassification = (change) => {
  if (change.classification) return change.classification;
  if (change.severity === "BREAKING") return "BREAKING";
  if (change.severity === "NON_BREAKING") return "NON_BREAKING";
  if (change.severity === "INFO") return "INFORMATIONAL";

  return "UNSUPPORTED";
};

const formatClassification = (classification) => {
  const labels = {
    BREAKING: "Breaking",
    POTENTIALLY_BREAKING: "Potentially breaking",
    NON_BREAKING: "Non-breaking",
    INFORMATIONAL: "Informational",
    UNSUPPORTED: "Unsupported",
  };

  return labels[classification] || "Unclassified";
};

const getClassificationClass = (classification) => {
  const classes = {
    BREAKING: "breaking",
    POTENTIALLY_BREAKING: "potentially-breaking",
    NON_BREAKING: "nonbreaking",
    INFORMATIONAL: "info",
    UNSUPPORTED: "unsupported",
  };

  return classes[classification] || "unknown";
};

const getPathKey = (change) => {
  return `${change.method || "—"} ${change.path || "Document-level change"}`;
};

const getCategoryLabel = (category) => {
  return CATEGORY_LABELS[category] || category || "Other";
};

const formatValue = (value) => {
  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "string") {
    return JSON.stringify(value, null, 2);
  }

  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
};

const AnalysisStatus = ({ status }) => {
  const complete = status === "COMPLETE";
  const failed = status === "FAILED";

  return (
    <span
      className={`comparison-status ${complete ? "is-complete" : failed ? "is-failed" : "is-partial"}`}
    >
      {complete ? (
        <ShieldCheck size={14} />
      ) : (
        <ShieldAlert size={14} />
      )}

      {complete
        ? "Analysis complete"
        : failed
          ? "Analysis failed"
          : "Partial analysis"}
    </span>
  );
};

const SummaryCard = ({ label, value, tone, icon: Icon }) => (
  <div className={`diff-summary-card diff-summary-${tone}`}>
    <div className="diff-summary-top">
      <span>{label}</span>
      <Icon size={16} />
    </div>

    <strong>{value ?? 0}</strong>
  </div>
);

const ChangeClassification = ({ change }) => {
  const classification = getChangeClassification(change);

  return (
    <span
      className={`diff-severity diff-severity-${getClassificationClass(classification)}`}
    >
      {formatClassification(classification)}
    </span>
  );
};

const ValuePanel = ({ title, value }) => (
  <section className="diff-value-panel">
    <div className="diff-value-heading">
      <strong>{title}</strong>
    </div>

    <pre>{formatValue(value)}</pre>
  </section>
);

const ReportWarnings = ({ warnings }) => {
  if (!warnings.length) {
    return null;
  }

  return (
    <section className="diff-report-warnings">
      <div className="diff-report-warnings-heading">
        <AlertCircle size={18} />

        <div>
          <strong>Analysis warnings</strong>
          <p>
            These warnings affect the completeness of this comparison.
          </p>
        </div>

        <span>{warnings.length}</span>
      </div>

      <div className="diff-report-warning-list">
        {warnings.map((warning, index) => (
          <div
            className="diff-report-warning"
            key={`${warning.field || "warning"}-${index}`}
          >
            <code>{warning.field || "document"}</code>
            <p>{warning.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

const ChangeInspector = ({ change }) => {
  if (!change) {
    return (
      <div className="diff-inspector-empty">
        <div>
          <Braces size={25} />
        </div>

        <h3>Select a change</h3>

        <p>
          Choose an item from the change list to inspect its details.
        </p>
      </div>
    );
  }

  return (
    <div className="diff-inspector-content">
      <div className="diff-inspector-heading">
        <span className="eyebrow">CHANGE INSPECTOR</span>

        <h2>{change.changeType.replaceAll("_", " ")}</h2>

        <div className="diff-inspector-badges">
          <ChangeClassification change={change} />

          <span className="diff-category-badge">
            {getCategoryLabel(change.category)}
          </span>
        </div>
      </div>

      <div className="diff-inspector-message">
        <strong>What changed</strong>
        <p>{change.summary || change.message}</p>
      </div>

      {change.rationale && (
        <div className="diff-inspector-message">
          <strong>Why this classification</strong>
          <p>{change.rationale}</p>
        </div>
      )}

      <div className="diff-inspector-location">
        <span>Rule ID</span>
        <strong>{change.ruleId || "Pending rule mapping"}</strong>

        <span>Change ID</span>
        <code>{change.changeId || "Not recorded"}</code>

        <span>HTTP method</span>
        <strong>{change.method || "Not operation-specific"}</strong>

        <span>Path</span>
        <code>{change.path || "Document-level change"}</code>

        <span>Field</span>
        <code>{change.field || "Not specified"}</code>

        <span>Operation key</span>
        <code>{change.operationKey || "Not available"}</code>

        <span>JSON Pointer</span>
        <code>{change.jsonPointer || "Not recorded"}</code>

        <span>Affected operations</span>
        <div className="diff-inspector-operation-list">
          {change.affectedOperationKeys?.length
            ? change.affectedOperationKeys.map((operationKey) => (
                <code key={operationKey}>{operationKey}</code>
              ))
            : <span>Not resolved</span>}
        </div>
      </div>

      <section className="diff-inspector-values">
        <span className="eyebrow">CONTRACT VALUES</span>

        <ValuePanel
          title="Baseline value"
          value={change.oldValue}
        />

        <ValuePanel
          title="Candidate value"
          value={change.newValue}
        />
      </section>

      <section className="diff-inspector-pointers">
        <span className="eyebrow">SOURCE LOCATIONS</span>

        <div>
          <span>Baseline JSON Pointer</span>
          <code>{change.baselinePointer || "Not recorded"}</code>
        </div>

        <div>
          <span>Candidate JSON Pointer</span>
          <code>{change.candidatePointer || "Not recorded"}</code>
        </div>
      </section>

      <div className="diff-inspector-note">
        <Info size={14} />
        The classification is produced by the server-side compatibility analyzer.
      </div>
    </div>
  );
};

const DiffReportPage = () => {
  const { projectId, reportId } = useParams();

  const [search, setSearch] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activePath, setActivePath] = useState("all");
  const [selectedChangeIndex, setSelectedChangeIndex] = useState(null);

  const projectQuery = useProject(projectId);
  const reportQuery = useDiffReport(projectId, reportId);

  const report = reportQuery.data;

  const changes = report?.changes ?? EMPTY_ARRAY;
  const warnings = report?.warnings ?? EMPTY_ARRAY;
  const summary = report?.summary;

  const changeRecords = useMemo(() => {
    return changes.map((change, index) => ({
      ...change,
      index,
      pathKey: getPathKey(change),
    }));
  }, [changes]);

  const pathGroups = useMemo(() => {
    const groups = new Map();

    for (const change of changeRecords) {
      const existing = groups.get(change.pathKey);

      if (existing) {
        existing.count += 1;
      } else {
        groups.set(change.pathKey, {
          key: change.pathKey,
          method: change.method,
          path: change.path,
          count: 1,
        });
      }
    }

    return [...groups.values()];
  }, [changeRecords]);

  const filteredChanges = useMemo(() => {
    const query = search.trim().toLowerCase();

    return changeRecords.filter((change) => {
      const classification = getChangeClassification(change);

      const matchesClassification =
        classificationFilter === "all" ||
        classification === classificationFilter;

      const matchesCategory =
        categoryFilter === "all" ||
        change.category === categoryFilter;

      const matchesPath =
        activePath === "all" ||
        change.pathKey === activePath;

      const searchContent = [
        change.path,
        change.method,
        change.category,
        change.changeType,
        change.field,
        change.message,
        change.summary,
        change.rationale,
        change.ruleId,
        change.operationKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchContent.includes(query);

      return (
        matchesClassification &&
        matchesCategory &&
        matchesPath &&
        matchesSearch
      );
    });
  }, [
    changeRecords,
    search,
    classificationFilter,
    categoryFilter,
    activePath,
  ]);

  const selectedChange =
    filteredChanges.find(
      (change) => change.index === selectedChangeIndex
    ) || filteredChanges[0];

  const categoryOptions = useMemo(() => {
    return [
      ...new Set(
        changes.map((change) => change.category).filter(Boolean)
      ),
    ].sort();
  }, [changes]);

  if (projectQuery.isPending || reportQuery.isPending) {
    return (
      <section className="comparison-page">
        <div className="comparison-loading">
          <span className="spinner" />
          Loading comparison report...
        </div>
      </section>
    );
  }

  if (projectQuery.isError || reportQuery.isError) {
    const error = projectQuery.error || reportQuery.error;

    return (
      <section className="comparison-page">
        <Link
          to={`/projects/${encodeURIComponent(projectId)}/comparisons`}
          className="back-link"
        >
          <ArrowLeft size={16} />
          Comparisons
        </Link>

        <div className="comparison-error-panel" role="alert">
          <AlertCircle size={20} />

          <div>
            <strong>Couldn't load this comparison report</strong>
            <p>{error.message}</p>

            <button
              className="comparison-text-button"
              type="button"
              onClick={() => reportQuery.refetch()}
            >
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  const isComplete = report.analysisStatus === "COMPLETE";
  const isFailed = report.analysisStatus === "FAILED";

  const regressionRunsPath =
    `/projects/${encodeURIComponent(projectId)}` +
    `/diff-reports/${encodeURIComponent(reportId)}/test-runs`;

  return (
    <section className="diff-report-page">
      <div className="comparison-breadcrumb">
        <Link
          to={`/projects/${encodeURIComponent(projectId)}`}
          className="back-link"
        >
          <ArrowLeft size={16} />
          {projectQuery.data.name}
        </Link>

        <span>/</span>

        <Link
          to={`/projects/${encodeURIComponent(projectId)}/comparisons`}
        >
          Comparisons
        </Link>

        <span>/</span>
        <span>Report</span>
      </div>

      <header className="diff-report-header">
        <div>
          <span className="eyebrow">COMPATIBILITY REPORT</span>
          <h1>Specification comparison</h1>

          <div className="diff-report-version-pair">
            <span>{report.baselineLabel}</span>
            <ArrowRight size={16} />
            <span>{report.candidateLabel}</span>
          </div>

          <div className="diff-report-meta">
            <span>
              <CalendarDays size={13} />
              {formatDate(report.createdAt)}
            </span>

            <span>
              Analyzer {report.analyzerVersion}
            </span>

            <span>
              Ruleset {report.rulesetVersion || "Not recorded (legacy report)"}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <Link
            to={regressionRunsPath}
            className="button button-primary"
          >
            <GitCompareArrows size={16} />
            Regression runs
          </Link>

          <AnalysisStatus status={report.analysisStatus} />
        </div>
      </header>

      {!isComplete && (
        <section className="diff-partial-banner" role="status">
          <div className="diff-partial-icon">
            <ShieldAlert size={20} />
          </div>

          <div>
            <strong>
              {isFailed
                ? "This comparison failed. No compatibility conclusion is available."
                : "This comparison is partial. Do not interpret it as a clean compatibility pass."}
            </strong>

            <p>
              {isFailed
                ? "The analyzer could not complete this comparison. Review the recorded diagnostics before retrying or drawing conclusions."
                : "The analyzer recorded warnings while evaluating these specification versions. Some relevant constructs may not have been fully assessed. Review every warning and affected change before drawing conclusions."}
            </p>
          </div>
        </section>
      )}

      <section className="diff-summary-grid">
        <SummaryCard
          label="Total changes"
          value={summary?.totalChanges}
          tone="total"
          icon={GitCompareArrows}
        />

        <SummaryCard
          label="Breaking"
          value={summary?.breaking ?? summary?.breakingChanges}
          tone="breaking"
          icon={CircleAlert}
        />

        <SummaryCard
          label="Potentially breaking"
          value={summary?.potentiallyBreaking}
          tone="potentially-breaking"
          icon={ShieldAlert}
        />

        <SummaryCard
          label="Non-breaking"
          value={summary?.nonBreaking ?? summary?.nonBreakingChanges}
          tone="nonbreaking"
          icon={CheckCircle2}
        />

        <SummaryCard
          label="Informational"
          value={summary?.informational ?? summary?.informationalChanges}
          tone="info"
          icon={Info}
        />

        <SummaryCard
          label="Unsupported"
          value={summary?.unsupported}
          tone="unsupported"
          icon={AlertCircle}
        />
      </section>

      <section className="diff-operation-summary">
        <div>
          <span>Added operations</span>
          <strong>{summary?.addedOperations ?? 0}</strong>
        </div>

        <div>
          <span>Removed operations</span>
          <strong>{summary?.removedOperations ?? 0}</strong>
        </div>

        <div>
          <span>Unchanged operations</span>
          <strong>{summary?.unchangedOperations ?? 0}</strong>
        </div>
      </section>

      <ReportWarnings warnings={warnings} />

      <div className="diff-workbench">
        <aside className="diff-path-sidebar">
          <div className="diff-sidebar-heading">
            <span className="eyebrow">CHANGE NAVIGATOR</span>
            <h2>Operations</h2>
          </div>

          <button
            type="button"
            className={`diff-path-item ${activePath === "all" ? "is-active" : ""}`}
            onClick={() => setActivePath("all")}
          >
            <span className="diff-path-item-icon">
              <Layers3 size={15} />
            </span>

            <span className="diff-path-item-copy">
              <strong>All changes</strong>
              <span>{changes.length} changes</span>
            </span>
          </button>

          <div className="diff-path-list">
            {pathGroups.map((group) => (
              <button
                type="button"
                className={`diff-path-item ${activePath === group.key ? "is-active" : ""}`}
                key={group.key}
                onClick={() => setActivePath(group.key)}
              >
                <span className="diff-path-item-icon">
                  <Code2 size={14} />
                </span>

                <span className="diff-path-item-copy">
                  <strong>
                    {group.method && (
                      <span className="diff-path-method">
                        {group.method}
                      </span>
                    )}

                    {group.path || "Document-level change"}
                  </strong>

                  <span>
                    {group.count} {group.count === 1 ? "change" : "changes"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="diff-change-panel">
          <div className="diff-change-panel-heading">
            <div>
              <span className="eyebrow">DETECTED CHANGES</span>
              <h2>Change list</h2>
            </div>

            <span className="diff-filter-count">
              {filteredChanges.length} of {changes.length}
            </span>
          </div>

          <div className="diff-filter-controls">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search changes..."
              aria-label="Search changes"
            />

            <select
              value={classificationFilter}
              onChange={(event) => setClassificationFilter(event.target.value)}
              aria-label="Filter by classification"
            >
              {CLASSIFICATION_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>

              {categoryOptions.map((category) => (
                <option value={category} key={category}>
                  {getCategoryLabel(category)}
                </option>
              ))}
            </select>
          </div>

          <div className="diff-change-list">
            {filteredChanges.length === 0 ? (
              <div className="diff-change-empty">
                <div>
                  <FileCode2 size={23} />
                </div>

                <h3>No changes match these filters</h3>

                <p>
                  Change the severity, category or search term to see other results.
                </p>

                <button
                  type="button"
                  className="comparison-text-button"
                  onClick={() => {
                    setSearch("");
                    setClassificationFilter("all");
                    setCategoryFilter("all");
                    setActivePath("all");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              filteredChanges.map((change) => (
                <button
                  type="button"
                  className={`diff-change-item ${selectedChange?.index === change.index ? "is-active" : ""}`}
                  key={`${change.changeType}-${change.field}-${change.index}`}
                  onClick={() => setSelectedChangeIndex(change.index)}
                  aria-pressed={selectedChange?.index === change.index}
                >
                  <div className="diff-change-item-top">
                    <ChangeClassification change={change} />

                    <span className="diff-change-category">
                      {getCategoryLabel(change.category)}
                    </span>
                  </div>

                  <strong>
                    {change.changeType.replaceAll("_", " ")}
                  </strong>

                  <span className="diff-change-message">
                    {change.summary || change.message}
                  </span>

                  <div className="diff-change-item-location">
                    <span>
                      {change.method || "—"}
                    </span>

                    <code>{change.path || "Document"}</code>

                    <ArrowRight size={13} />
                  </div>
                </button>
              ))
            )}
          </div>
        </main>

        <aside className="diff-inspector-panel">
          <ChangeInspector change={selectedChange} />
        </aside>
      </div>
    </section>
  );
};

export default DiffReportPage;
