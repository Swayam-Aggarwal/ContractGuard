import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "../../lib/api.js";

export const diffReportQueryKeys = {
  all: ["diffReports"],

  project: (projectId) => [
    "diffReports",
    "project",
    projectId,
  ],

  detail: (projectId, reportId) => [
    "diffReports",
    "project",
    projectId,
    "detail",
    reportId,
  ],
};

export const diffReportsApi = {
  list: async (projectId) => {
    const data = await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}/diff-reports?limit=50`
    );

    return data.diffReports;
  },

  create: async ({
    projectId,
    baselineVersionId,
    candidateVersionId,
  }) => {
    const data = await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}/diff-reports`,
      {
        method: "POST",
        body: {
          baselineVersionId,
          candidateVersionId,
        },
      }
    );

    return {
      diffReport: data.diffReport,
      reused: data.reused,
    };
  },

  get: async ({ projectId, reportId }) => {
    const data = await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}/diff-reports/${encodeURIComponent(reportId)}`
    );

    return data.diffReport;
  },
};

export const useDiffReports = (projectId) => {
  return useQuery({
    queryKey: diffReportQueryKeys.project(projectId),
    queryFn: () => diffReportsApi.list(projectId),
    enabled: Boolean(projectId),
  });
};

export const useCreateDiffReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: diffReportsApi.create,

    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: diffReportQueryKeys.project(
          variables.projectId
        ),
      });
    },
  });
};

export const useDiffReport = (projectId, reportId) => {
  return useQuery({
    queryKey: diffReportQueryKeys.detail(
      projectId,
      reportId
    ),

    queryFn: () =>
      diffReportsApi.get({
        projectId,
        reportId,
      }),

    enabled: Boolean(projectId && reportId),
  });
};