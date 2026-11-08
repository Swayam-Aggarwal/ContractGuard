import { z } from "zod";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "../../lib/api.js";

export const projectFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name is required.")
      .max(80, "Project name must not exceed 80 characters."),

    description: z
      .string()
      .trim()
      .max(500, "Description must not exceed 500 characters."),
  })
  .strict();

export const projectQueryKeys = {
  all: ["projects"],

  list: ["projects", "list"],

  detail: (projectId) => [
    "projects",
    "detail",
    projectId,
  ],
};

export const projectsApi = {
  list: async () => {
    const data = await apiRequest("/api/v1/projects");

    return data.projects;
  },

  get: async (projectId) => {
    const data = await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}`
    );

    return data.project;
  },

  create: async (details) => {
    const data = await apiRequest("/api/v1/projects", {
      method: "POST",
      body: {
        name: details.name,
        ...(details.description
          ? { description: details.description }
          : {}),
      },
    });

    return data.project;
  },

  update: async ({ projectId, ...updates }) => {
    const data = await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        body: updates,
      }
    );

    return data.project;
  },

  delete: async (projectId) => {
    const data = await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}`,
      {
        method: "DELETE",
        body: {},
      }
    );

    return data;
  },
};

export const useProjects = () => {
  return useQuery({
    queryKey: projectQueryKeys.list,
    queryFn: projectsApi.list,
  });
};

export const useProject = (projectId) => {
  return useQuery({
    queryKey: projectQueryKeys.detail(projectId),
    queryFn: () => projectsApi.get(projectId),
    enabled: Boolean(projectId),
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: projectsApi.create,

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectQueryKeys.list,
      });
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: projectsApi.update,

    onSuccess: async (project) => {
      queryClient.setQueryData(
        projectQueryKeys.detail(project.id),
        project
      );

      await queryClient.invalidateQueries({
        queryKey: projectQueryKeys.list,
      });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: projectsApi.delete,

    onSuccess: async (_result, projectId) => {
      queryClient.removeQueries({
        queryKey: projectQueryKeys.detail(projectId),
      });

      await queryClient.invalidateQueries({
        queryKey: projectQueryKeys.list,
      });
    },
  });
};