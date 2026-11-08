import projectService from "../services/project.service.js";

const toPublicProject = (project) => ({
  id: project._id.toString(),
  name: project.name,
  slug: project.slug,
  description: project.description ?? null,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

const createProjectController = () => {
  const listProjects = async (req, res) => {
    const projects = await projectService.listProjects(
      req.user.id
    );

    return res.status(200).json({
      success: true,
      data: {
        projects: projects.map(toPublicProject),
      },
    });
  };

  const createProject = async (req, res) => {
    const project = await projectService.createProject(
      req.user.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      data: {
        project: toPublicProject(project),
      },
    });
  };

  const getProject = async (req, res) => {
    const project = await projectService.getProject(
      req.user.id,
      req.validatedParams.projectId
    );

    return res.status(200).json({
      success: true,
      data: {
        project: toPublicProject(project),
      },
    });
  };

  const updateProject = async (req, res) => {
    const project = await projectService.updateProject(
      req.user.id,
      req.validatedParams.projectId,
      req.body
    );

    return res.status(200).json({
      success: true,
      data: {
        project: toPublicProject(project),
      },
    });
  };

  const deleteProject = async (req, res) => {
    const project = await projectService.deleteProject(
      req.user.id,
      req.validatedParams.projectId
    );

    return res.status(200).json({
      success: true,
      data: {
        project: toPublicProject(project),
        message: "Project deleted successfully.",
      },
    });
  };

  return {
    listProjects,
    createProject,
    getProject,
    updateProject,
    deleteProject,
  };
};

export default createProjectController;