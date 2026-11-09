
import { useRef, useState } from "react";

import {
  Link,
  useParams,
} from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  FileCode2,
  FileText,
  FolderKanban,
  GitCompareArrows,
  Info,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  useProject,
} from "../features/projects/projects.js";

import {
  SPECIFICATION_MAX_FILE_SIZE,
  useSpecificationVersions,
  useUploadSpecification,
} from "../features/specifications/specifications.js";

import "./ProjectPage.css";

const SUPPORTED_EXTENSIONS = new Set([
  "json",
  "yaml",
  "yml",
]);

const formatDate = (value) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const getFileExtension = (fileName) => {
  return fileName.split(".").pop()?.toLowerCase() || "";
};

const validateSelectedFile = (file) => {
  if (!file) {
    return "Choose an OpenAPI specification file first.";
  }

  const extension = getFileExtension(file.name);

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return "Choose a JSON or YAML file (.json, .yaml or .yml).";
  }

  if (file.size === 0) {
    return "The selected file is empty.";
  }

  if (file.size > SPECIFICATION_MAX_FILE_SIZE) {
    return "The specification file must not exceed 1 MiB.";
  }

  return "";
};

const StatusBadge = ({ children, tone = "neutral" }) => (
  <span className={`spec-status-badge spec-status-${tone}`}>
    {children}
  </span>
);

const DiagnosticList = ({ title, warnings }) => {
  if (!warnings?.length) {
    return null;
  }

  return (
    <div className="spec-diagnostic-group">
      <h4>{title}</h4>

      <ul>
        {warnings.map((warning, index) => (
          <li key={`${warning.field || "document"}-${index}`}>
            <code>{warning.field || "document"}</code>
            <span>{warning.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const VersionRow = ({
  version,
  projectId,
  isExpanded,
  onToggle,
}) => {
  const parserWarnings = version.warnings || [];
  const explorerWarnings = version.explorerWarnings || [];

  const warningCount =
    parserWarnings.length + explorerWarnings.length;

  const isExplorerComplete =
    version.explorerCompleteness === "COMPLETE";

  return (
    <article className="spec-version-item">
      <div className="spec-version-row">
        <div className="spec-version-identity">
          <div className="spec-version-file-icon">
            <FileCode2 size={19} />
          </div>

          <div className="spec-version-name-block">
            <div className="spec-version-title-line">
              <h3>{version.label}</h3>

              <StatusBadge
                tone={
                  version.parseStatus === "VALID"
                    ? "success"
                    : "warning"
                }
              >
                {version.parseStatus === "VALID"
                  ? "Valid"
                  : version.parseStatus || "Unknown"}
              </StatusBadge>
            </div>

            <p title={version.title}>{version.title}</p>

            <Link
              className="spec-open-explorer"
              to={`/projects/${encodeURIComponent(projectId)}/specifications/${encodeURIComponent(version.id)}/explorer`}
            >
              <FileCode2 size={13} />
              Open API Explorer
              <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>

        <div className="spec-version-facts">
          <span>OpenAPI {version.openapiVersion}</span>

          <span>
            {String(version.sourceFormat || "—").toUpperCase()}
          </span>

          <span>
            {version.operationCount}{" "}
            {version.operationCount === 1
              ? "operation"
              : "operations"}
          </span>
        </div>

        <div className="spec-version-analysis">
          <StatusBadge tone={isExplorerComplete ? "success" : "warning"}>
            {isExplorerComplete
              ? "Explorer complete"
              : "Explorer partial"}
          </StatusBadge>

          <span className="spec-version-date">
            <CalendarDays size={13} />
            {formatDate(version.createdAt)}
          </span>
        </div>

        <button
          className="spec-version-details-button"
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Hide" : "Show"} diagnostics for ${version.label}`}
        >
          {warningCount > 0
            ? `${warningCount} warnings`
            : "Details"}

          <ChevronDown
            size={15}
            className={isExpanded ? "is-rotated" : ""}
          />
        </button>
      </div>

      {isExpanded && (
        <div className="spec-version-details">
          {warningCount === 0 ? (
            <div className="spec-no-diagnostics">
              <CheckCircle2 size={16} />
              No parser or explorer warnings were recorded for this version.
            </div>
          ) : (
            <>
              <DiagnosticList
                title="Parser diagnostics"
                warnings={parserWarnings}
              />

              <DiagnosticList
                title="Explorer coverage warnings"
                warnings={explorerWarnings}
              />
            </>
          )}
        </div>
      )}
    </article>
  );
};

const ProjectPage = () => {
  const { projectId } = useParams();

  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [fileError, setFileError] = useState("");
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState(null);

  const projectQuery = useProject(projectId);
  const versionsQuery = useSpecificationVersions(projectId);
  const uploadMutation = useUploadSpecification();

  const project = projectQuery.data;
  const versions = versionsQuery.data || [];

  const selectFile = (file) => {
    setUploadFeedback(null);
    setFileError("");

    uploadMutation.reset();

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validationMessage = validateSelectedFile(file);

    if (validationMessage) {
      setSelectedFile(null);
      setFileError(validationMessage);
      return;
    }

    setSelectedFile(file);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (file) {
      selectFile(file);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);

    if (event.dataTransfer.files?.length > 1) {
      setSelectedFile(null);
      setFileError("Upload one specification file at a time.");
      setUploadFeedback(null);
      return;
    }

    selectFile(event.dataTransfer.files?.[0] || null);
  };

  const handleUpload = async (event) => {
    event.preventDefault();

    setUploadFeedback(null);

    if (!selectedFile) {
      setFileError("Choose an OpenAPI specification file first.");
      return;
    }

    if (versionLabel.trim().length > 80) {
      setFileError("The version label must not exceed 80 characters.");
      return;
    }

    setFileError("");

    try {
      const specification = await uploadMutation.mutateAsync({
        projectId,
        file: selectedFile,
        label: versionLabel,
      });

      setSelectedFile(null);
      setVersionLabel("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setUploadFeedback({
        tone: "success",
        message: `${specification.label} was uploaded and saved successfully.`,
      });
    } catch (error) {
      setUploadFeedback({
        tone: "error",
        message: error.message,
        details: error.details,
      });
    }
  };

  if (projectQuery.isPending) {
    return (
      <section className="page-section project-page">
        <div className="project-page-loading">
          <span className="spinner" />
          Loading project workspace...
        </div>
      </section>
    );
  }

  if (projectQuery.isError) {
    return (
      <section className="page-section project-page">
        <Link to="/projects" className="back-link">
          <ArrowLeft size={16} />
          Back to projects
        </Link>

        <div className="error-panel page-error-panel">
          <h2>
            {projectQuery.error.status === 404
              ? "Project not found"
              : "Couldn't load project"}
          </h2>

          <p>{projectQuery.error.message}</p>

          {projectQuery.error.status !== 404 && (
            <button
              className="button button-primary"
              type="button"
              onClick={() => projectQuery.refetch()}
            >
              Retry
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="page-section project-page">
      <Link to="/projects" className="back-link">
        <ArrowLeft size={16} />
        All projects
      </Link>

      <header className="project-page-header">
        <div className="project-page-title">
          <div className="project-page-icon">
            <FolderKanban size={23} />
          </div>

          <div className="project-page-title-copy">
            <span className="eyebrow">PROJECT WORKSPACE</span>
            <h1>{project.name}</h1>

            <p>
              {project.description ||
                "Manage OpenAPI specifications and review contract changes for this project."}
            </p>
          </div>
        </div>

        <div className="project-page-header-meta">
          <Link
            to={`/projects/${encodeURIComponent(projectId)}/comparisons`}
            className="button button-primary project-compare-link"
          >
            <GitCompareArrows size={15} />
            Compare versions
          </Link>

          <span className="project-privacy-label">
            <ShieldCheck size={14} />
            Private workspace
          </span>

          <span className="slug-label">{project.slug}</span>
        </div>
      </header>

      <div className="project-page-content-grid">
        <section
          className="spec-upload-panel"
          aria-labelledby="spec-upload-heading"
        >
          <div className="spec-panel-heading">
            <div className="spec-panel-heading-icon">
              <CloudUpload size={19} />
            </div>

            <div>
              <span className="eyebrow">SPECIFICATION INGESTION</span>

              <h2 id="spec-upload-heading">
                Import an OpenAPI specification
              </h2>

              <p>
                Upload a JSON or YAML contract to create an immutable version in this project.
              </p>
            </div>
          </div>

          <form className="spec-upload-form" onSubmit={handleUpload}>
            <div
              className={`spec-dropzone ${isDragging ? "is-dragging" : ""} ${selectedFile ? "has-file" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setIsDragging(false);
                }
              }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                id="specification-file"
                className="spec-file-input"
                type="file"
                accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
                onChange={handleFileChange}
                aria-describedby="spec-upload-hint"
              />

              <label
                htmlFor="specification-file"
                className="spec-dropzone-label"
              >
                <span className="spec-dropzone-icon">
                  <FileCode2 size={24} />
                </span>

                <span className="spec-dropzone-title">
                  {selectedFile
                    ? "Choose a different file"
                    : "Drop your specification here"}
                </span>

                <span className="spec-dropzone-subtitle">
                  or <span>browse files</span> from your computer
                </span>
              </label>

              <span
                id="spec-upload-hint"
                className="spec-upload-hint"
              >
                JSON, YAML or YML · Maximum file size 1 MiB
              </span>
            </div>

            {selectedFile && (
              <div className="spec-selected-file">
                <div className="spec-selected-file-icon">
                  <FileText size={18} />
                </div>

                <div className="spec-selected-file-copy">
                  <strong title={selectedFile.name}>
                    {selectedFile.name}
                  </strong>

                  <span>{formatFileSize(selectedFile.size)}</span>
                </div>

                <button
                  className="spec-remove-file"
                  type="button"
                  onClick={() => {
                    selectFile(null);

                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  aria-label="Remove selected file"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            <div className="spec-label-field">
              <label htmlFor="specification-label">
                Version label <span>Optional</span>
              </label>

              <input
                id="specification-label"
                type="text"
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
                maxLength={80}
                placeholder="e.g. 2.0.0 or release-2026-11"
                autoComplete="off"
              />

              <p>
                Leave blank to use the version from the OpenAPI document.
              </p>
            </div>

            {fileError && (
              <div
                className="spec-upload-feedback is-error"
                role="alert"
              >
                <AlertCircle size={16} />
                <span>{fileError}</span>
              </div>
            )}

            {uploadFeedback && (
              <div
                className={`spec-upload-feedback ${uploadFeedback.tone === "success" ? "is-success" : "is-error"}`}
                role={uploadFeedback.tone === "success" ? "status" : "alert"}
              >
                {uploadFeedback.tone === "success"
                  ? <CheckCircle2 size={16} />
                  : <AlertCircle size={16} />}

                <div>
                  <span>{uploadFeedback.message}</span>

                  {uploadFeedback.details?.length > 0 && (
                    <ul>
                      {uploadFeedback.details.map((detail, index) => (
                        <li key={`${detail.field || "error"}-${index}`}>
                          {detail.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <div className="spec-upload-actions">
              <div className="spec-upload-security-note">
                <ShieldCheck size={14} />
                Files are validated before being saved.
              </div>

              <button
                className="button button-primary spec-upload-submit"
                type="submit"
                disabled={!selectedFile || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <>
                    <span className="spinner spinner-light" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <CloudUpload size={16} />
                    Upload specification
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        <aside
          className="project-context-panel"
          aria-labelledby="project-context-heading"
        >
          <div className="project-context-heading">
            <span className="eyebrow">PROJECT DETAILS</span>

            <h2 id="project-context-heading">
              Workspace information
            </h2>
          </div>

          <dl className="project-context-list">
            <div>
              <dt>Created</dt>
              <dd>{formatDate(project.createdAt)}</dd>
            </div>

            <div>
              <dt>Last activity</dt>
              <dd>{formatDate(project.updatedAt)}</dd>
            </div>

            <div>
              <dt>Specification versions</dt>
              <dd>
                {versionsQuery.isPending
                  ? "Loading…"
                  : versions.length}
              </dd>
            </div>
          </dl>

          <div className="project-context-divider" />

          <div className="project-constraints-heading">
            <Info size={15} />
            <strong>Upload requirements</strong>
          </div>

          <ul className="project-constraints-list">
            <li>OpenAPI 3.0, 3.1 and 3.2 documents</li>
            <li>JSON and YAML file formats</li>
            <li>Maximum upload size of 1 MiB</li>
            <li>Internal references are supported; external references are not fetched</li>
          </ul>
        </aside>
      </div>

      <section
        className="spec-versions-panel"
        aria-labelledby="spec-versions-heading"
      >
        <div className="spec-versions-header">
          <div>
            <span className="eyebrow">VERSION HISTORY</span>

            <h2 id="spec-versions-heading">
              Specification versions
            </h2>

            <p>Immutable uploads associated with this project.</p>
          </div>

          <span className="spec-version-count">
            {versions.length}{" "}
            {versions.length === 1 ? "version" : "versions"}
          </span>
        </div>

        {versionsQuery.isPending ? (
          <div className="spec-versions-loading">
            <span className="spinner" />
            Loading specification versions...
          </div>
        ) : versionsQuery.isError ? (
          <div className="spec-versions-error" role="alert">
            <div>
              <AlertCircle size={17} />
              <span>{versionsQuery.error.message}</span>
            </div>

            <button
              className="button button-secondary"
              type="button"
              onClick={() => versionsQuery.refetch()}
              disabled={versionsQuery.isFetching}
            >
              Retry
            </button>
          </div>
        ) : versions.length === 0 ? (
          <div className="spec-versions-empty">
            <div className="spec-versions-empty-icon">
              <FileCode2 size={23} />
            </div>

            <h3>No specifications uploaded yet</h3>

            <p>
              Upload your first OpenAPI document to start building this project's version history.
            </p>
          </div>
        ) : (
          <div className="spec-version-list">
            {versions.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                projectId={projectId}
                isExpanded={expandedVersionId === version.id}
                onToggle={() => {
                  setExpandedVersionId((current) => (
                    current === version.id ? null : version.id
                  ));
                }}
              />
            ))}
          </div>
        )}

        {versionsQuery.isFetching && !versionsQuery.isPending && (
          <div className="spec-refresh-indicator">
            <span className="spinner" />
            Refreshing version history...
          </div>
        )}
      </section>
    </section>
  );
};

export default ProjectPage;
