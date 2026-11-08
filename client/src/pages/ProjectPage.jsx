import {
  Link,
  useParams,
} from "react-router";

import {
  ArrowLeft,
  FileCode,
  FolderKanban,
} from "lucide-react";

import {
  useProject,
} from "../features/projects/projects.js";

const ProjectPage = () => {
  const { projectId } = useParams();

  const {
    data: project,
    isPending,
    isError,
    error,
    refetch,
  } = useProject(projectId);

  if (isPending) {
    return (
      <section className="page-section">
        <div className="loading-table">
          <span className="spinner" />
          Loading project...
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="page-section">
        <Link to="/projects" className="back-link">
          <ArrowLeft size={16} />
          Back to projects
        </Link>

        <div className="error-panel page-error-panel">
          <h2>
            {error.status === 404
              ? "Project not found"
              : "Couldn't load project"}
          </h2>

          <p>{error.message}</p>

          {error.status !== 404 && (
            <button
              className="button button-primary"
              type="button"
              onClick={() => refetch()}
            >
              Retry
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="page-section">
      <Link to="/projects" className="back-link">
        <ArrowLeft size={16} />
        All projects
      </Link>

      <div className="page-header project-detail-header">
        <div className="project-detail-title">
          <div className="project-icon project-icon-large">
            <FolderKanban size={23} />
          </div>

          <div>
            <span className="eyebrow">PROJECT OVERVIEW</span>
            <h1>{project.name}</h1>

            {project.description && (
              <p>{project.description}</p>
            )}
          </div>
        </div>

        <span className="slug-label">
          {project.slug}
        </span>
      </div>

      <div className="project-setup-panel">
        <div className="project-setup-icon">
          <FileCode size={24} />
        </div>

        <div className="project-setup-content">
          <span className="eyebrow">NEXT SETUP STEP</span>

          <h2>Import your first API specification</h2>

          <p>
            Your project has been created successfully. OpenAPI
            import and version management will be added in the
            next development phase.
          </p>
        </div>
      </div>

      <div className="project-metadata">
        <div>
          <span>Created</span>
          <strong>
            {new Date(project.createdAt).toLocaleString()}
          </strong>
        </div>

        <div>
          <span>Last updated</span>
          <strong>
            {new Date(project.updatedAt).toLocaleString()}
          </strong>
        </div>

        <div>
          <span>Project identifier</span>
          <strong className="technical-value">
            {project.id}
          </strong>
        </div>
      </div>
    </section>
  );
};

export default ProjectPage;