import { useEffect, useMemo, useRef, useState } from "react";

import {
  Link,
  useNavigate,
} from "react-router";

import {
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import {
  useForm,
} from "react-hook-form";

import {
  zodResolver,
} from "@hookform/resolvers/zod";

import {
  projectFormSchema,
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from "../features/projects/projects.js";

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

const ProjectDialog = ({
  mode,
  project,
  onClose,
  onSubmit,
}) => {
  const dialogRef = useRef(null);

  const form = useForm({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name || "",
      description: project?.description || "",
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = form;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  const submitForm = handleSubmit(async (values) => {
    try {
      await onSubmit({
        name: values.name.trim(),
        description: values.description.trim(),
      });

      onClose();
    } catch (error) {
      setError("root.server", {
        type: "server",
        message: error.message,
      });
    }
  });

  return (
    <dialog
      ref={dialogRef}
      className="project-dialog"
      aria-labelledby="project-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="dialog-header">
        <div>
          <span className="eyebrow">PROJECT SETTINGS</span>

          <h2 id="project-dialog-title">
            {mode === "edit" ? "Edit project" : "Create a project"}
          </h2>

          <p>
            {mode === "edit"
              ? "Update your project details."
              : "Start a new API workspace."}
          </p>
        </div>

        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>
      </div>

      <form className="dialog-form" onSubmit={submitForm}>
        {errors.root?.server?.message && (
          <div className="form-alert" role="alert">
            {errors.root.server.message}
          </div>
        )}

        <div className="form-field">
          <label htmlFor="project-name">
            Project name <span className="required-mark">*</span>
          </label>

          <input
            id="project-name"
            type="text"
            placeholder="e.g. Store API"
            maxLength={80}
            autoFocus
            {...register("name")}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={
              errors.name ? "project-name-error" : undefined
            }
          />

          {errors.name && (
            <p className="field-error" id="project-name-error">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="project-description">
            Description <span className="optional-label">Optional</span>
          </label>

          <textarea
            id="project-description"
            rows={4}
            maxLength={500}
            placeholder="What API are you working with?"
            {...register("description")}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description
                ? "project-description-error"
                : undefined
            }
          />

          {errors.description && (
            <p
              className="field-error"
              id="project-description-error"
            >
              {errors.description.message}
            </p>
          )}
        </div>

        <div className="dialog-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>

          <button
            className="button button-primary"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner spinner-light" />
                Saving...
              </>
            ) : mode === "edit" ? (
              "Save changes"
            ) : (
              "Create project"
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
};

const ProjectRow = ({
  project,
  onEdit,
  onDelete,
  deleting,
}) => (
  <tr>
    <td>
      <div className="project-name-cell">
        <div className="project-icon">
          <FolderKanban size={18} />
        </div>

        <div className="project-name-content">
          <Link
            className="project-title-link"
            to={`/projects/${project.id}`}
          >
            {project.name}
          </Link>

          <span className="project-slug">
            /{project.slug}
          </span>

          {project.description && (
            <span className="project-description">
              {project.description}
            </span>
          )}
        </div>
      </div>
    </td>

    <td>
      <span className="muted-value">
        No specification yet
      </span>
    </td>

    <td className="date-cell">
      {formatDate(project.updatedAt)}
    </td>

    <td>
      <span className="status-label status-pending">
        Setup
      </span>
    </td>

    <td>
      <div className="project-row-actions">
        <button
          className="icon-button"
          type="button"
          onClick={() => onEdit(project)}
          aria-label={`Edit ${project.name}`}
          title="Edit project"
        >
          <Pencil size={16} />
        </button>

        <button
          className="icon-button icon-button-danger"
          type="button"
          onClick={() => onDelete(project)}
          disabled={deleting}
          aria-label={`Delete ${project.name}`}
          title="Delete project"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </td>
  </tr>
);

const ProjectsPage = () => {
  const navigate = useNavigate();

  const {
    data: projects = [],
    isPending,
    isError,
    error,
    refetch,
  } = useProjects();

  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();

  const [searchTerm, setSearchTerm] = useState("");
  const [dialogState, setDialogState] = useState(null);
  const [pageError, setPageError] = useState("");

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return projects;
    }

    return projects.filter((project) => (
      project.name.toLowerCase().includes(normalizedSearch) ||
      project.slug.toLowerCase().includes(normalizedSearch) ||
      (project.description || "")
        .toLowerCase()
        .includes(normalizedSearch)
    ));
  }, [projects, searchTerm]);

  const handleCreate = () => {
    setPageError("");
    setDialogState({
      mode: "create",
      project: null,
    });
  };

  const handleEdit = (project) => {
    setPageError("");
    setDialogState({
      mode: "edit",
      project,
    });
  };

  const handleCloseDialog = () => {
    setDialogState(null);
  };

  const handleSaveProject = async (values) => {
    setPageError("");

    if (dialogState.mode === "edit") {
      await updateMutation.mutateAsync({
        projectId: dialogState.project.id,
        ...values,
      });

      return;
    }

    const project = await createMutation.mutateAsync(values);

    navigate(`/projects/${project.id}`);
  };

  const handleDelete = async (project) => {
    const confirmed = window.confirm(
      `Delete "${project.name}"?\n\nThis permanently deletes the project and its associated specifications, comparisons, test cases and test runs. This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setPageError("");

    try {
      await deleteMutation.mutateAsync(project.id);
    } catch (deleteError) {
      setPageError(deleteError.message);
    }
  };

  if (isPending) {
    return (
      <section className="page-section">
        <div className="page-header">
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <h1>Projects</h1>
          </div>
        </div>

        <div className="loading-table">
          <span className="spinner" />
          Loading your projects...
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="page-section">
        <div className="page-header">
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <h1>Projects</h1>
          </div>
        </div>

        <div className="error-panel page-error-panel">
          <h2>Couldn't load projects</h2>
          <p>{error.message}</p>

          <button
            className="button button-primary"
            type="button"
            onClick={() => refetch()}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section">
      <div className="page-header page-header-row">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>Projects</h1>
          <p>
            Manage your API workspaces and return to recent work.
          </p>
        </div>

        <button
          className="button button-primary"
          type="button"
          onClick={handleCreate}
        >
          <Plus size={17} />
          New project
        </button>
      </div>

      {pageError && (
        <div className="form-alert page-alert" role="alert">
          {pageError}
        </div>
      )}

      <div className="projects-toolbar">
        <div className="projects-toolbar-heading">
          <h2>All projects</h2>
          <span className="item-count">{projects.length}</span>
        </div>

        <div className="search-control">
          <Search size={16} />

          <input
            type="search"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
            aria-label="Search projects"
          />

          {searchTerm && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => setSearchTerm("")}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FolderKanban size={25} />
          </div>

          <h2>No projects yet</h2>

          <p>
            Create your first API project to start importing
            specifications and analyzing contract changes.
          </p>

          <button
            className="button button-primary"
            type="button"
            onClick={handleCreate}
          >
            <Plus size={17} />
            Create your first project
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="empty-state compact-empty-state">
          <Search size={24} />

          <h2>No matching projects</h2>

          <p>Try a different project name or search term.</p>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => setSearchTerm("")}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="table-container">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Latest specification</th>
                <th>Last activity</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  deleting={deleteMutation.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="projects-footnote">
        <span>
          <MoreHorizontal size={15} />
          Projects are private to your account.
        </span>

        <span>
          {filteredProjects.length} of {projects.length} shown
        </span>
      </div>

      {dialogState && (
        <ProjectDialog
          key={dialogState.project?.id || dialogState.mode}
          mode={dialogState.mode}
          project={dialogState.project}
          onClose={handleCloseDialog}
          onSubmit={handleSaveProject}
        />
      )}
    </section>
  );
};

export default ProjectsPage;