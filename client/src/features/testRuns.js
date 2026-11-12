import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "../lib/api.js";

export const testRunQueryKeys = {
  all: ["testRuns"],

  comparison: (projectId, reportId) => [
    "testRuns",
    "project",
    projectId,
    "comparison",
    reportId,
  ],

  detail: (projectId, reportId, testRunId) => [
    "testRuns",
    "project",
    projectId,
    "comparison",
    reportId,
    "detail",
    testRunId,
  ],
};

const comparisonPath = (projectId, reportId) =>
  `/api/v1/projects/${encodeURIComponent(projectId)}/diff-reports/${encodeURIComponent(reportId)}/test-runs`;

export const testRunsApi = {
  list: async ({ projectId, reportId }) => {
    const data = await apiRequest(
      comparisonPath(projectId, reportId)
    );

    return {
      executionEligibility: data.executionEligibility,
      testRuns: data.testRuns ?? [],
    };
  },

  create: async ({
    projectId,
    reportId,
    testCaseIds,
  }) => {
    const data = await apiRequest(
      comparisonPath(projectId, reportId),
      {
        method: "POST",
        body: { testCaseIds },
      }
    );

    return data.testRun;
  },

  get: async ({
    projectId,
    reportId,
    testRunId,
  }) => {
    const data = await apiRequest(
      `${comparisonPath(projectId, reportId)}/${encodeURIComponent(testRunId)}`
    );

    return data.testRun;
  },
};

const isActiveRun = (status) =>
  ["QUEUED", "RUNNING"].includes(status);

export const useTestRuns = (projectId, reportId) => {
  return useQuery({
    queryKey: testRunQueryKeys.comparison(
      projectId,
      reportId
    ),
    queryFn: () =>
      testRunsApi.list({
        projectId,
        reportId,
      }),
    enabled: Boolean(projectId && reportId),
    refetchInterval: (query) =>
      query.state.data?.testRuns?.some(
        (run) => isActiveRun(run.status)
      )
        ? 2000
        : false,
  });
};

export const useTestRun = (
  projectId,
  reportId,
  testRunId
) => {
  return useQuery({
    queryKey: testRunQueryKeys.detail(
      projectId,
      reportId,
      testRunId
    ),
    queryFn: () =>
      testRunsApi.get({
        projectId,
        reportId,
        testRunId,
      }),
    enabled: Boolean(projectId && reportId && testRunId),
    refetchInterval: (query) =>
      isActiveRun(query.state.data?.status)
        ? 1200
        : false,
  });
};

export const useCreateTestRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: testRunsApi.create,

    onSuccess: async (testRun, variables) => {
      queryClient.setQueryData(
        testRunQueryKeys.detail(
          variables.projectId,
          variables.reportId,
          testRun.id
        ),
        testRun
      );

      await queryClient.invalidateQueries({
        queryKey: testRunQueryKeys.comparison(
          variables.projectId,
          variables.reportId
        ),
      });
    },
  });
};