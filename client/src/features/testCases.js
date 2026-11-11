
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "../lib/api.js";
import { diffReportQueryKeys } from "./comparisons/diffReports.js";

export const testCaseQueryKeys = {
  all: ["testCases"],

  specification: (specVersionId) => [
    "testCases",
    "specification",
    specVersionId,
  ],

  detail: (testCaseId) => [
    "testCases",
    "detail",
    testCaseId,
  ],
};

export const testCasesApi = {
  list: async (specVersionId) => {
    const data = await apiRequest(
      `/api/v1/specifications/${encodeURIComponent(specVersionId)}/test-cases`
    );

    return data.testCases;
  },

  create: async ({ specVersionId, ...body }) => {
    const data = await apiRequest(
      `/api/v1/specifications/${encodeURIComponent(specVersionId)}/test-cases`,
      {
        method: "POST",
        body,
      }
    );

    return data.testCase;
  },

  get: async (testCaseId) => {
    const data = await apiRequest(
      `/api/v1/test-cases/${encodeURIComponent(testCaseId)}`
    );

    return data.testCase;
  },

  update: async ({ testCaseId, ...body }) => {
    const data = await apiRequest(
      `/api/v1/test-cases/${encodeURIComponent(testCaseId)}`,
      {
        method: "PATCH",
        body,
      }
    );

    return data.testCase;
  },

  approve: async (testCaseId) => {
    const data = await apiRequest(
      `/api/v1/test-cases/${encodeURIComponent(testCaseId)}/approve`,
      { method: "POST" }
    );

    return data.testCase;
  },

  archive: async (testCaseId) => {
    const data = await apiRequest(
      `/api/v1/test-cases/${encodeURIComponent(testCaseId)}/archive`,
      { method: "POST" }
    );

    return data.testCase;
  },
};

const invalidateTestCaseViews = async (queryClient, specVersionId) => {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: testCaseQueryKeys.specification(specVersionId),
    }),
    queryClient.invalidateQueries({
      queryKey: diffReportQueryKeys.all,
    }),
  ]);
};

export const useTestCases = (specVersionId) => {
  return useQuery({
    queryKey: testCaseQueryKeys.specification(specVersionId),
    queryFn: () => testCasesApi.list(specVersionId),
    enabled: Boolean(specVersionId),
  });
};

export const useTestCase = (testCaseId) => {
  return useQuery({
    queryKey: testCaseQueryKeys.detail(testCaseId),
    queryFn: () => testCasesApi.get(testCaseId),
    enabled: Boolean(testCaseId),
  });
};

export const useCreateTestCase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: testCasesApi.create,
    onSuccess: async (testCase) => {
      await invalidateTestCaseViews(queryClient, testCase.specVersionId);
    },
  });
};

export const useUpdateTestCase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: testCasesApi.update,
    onSuccess: async (testCase) => {
      await Promise.all([
        invalidateTestCaseViews(queryClient, testCase.specVersionId),
        queryClient.invalidateQueries({
          queryKey: testCaseQueryKeys.detail(testCase.id),
        }),
      ]);
    },
  });
};

export const useApproveTestCase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: testCasesApi.approve,
    onSuccess: async (testCase) => {
      await Promise.all([
        invalidateTestCaseViews(queryClient, testCase.specVersionId),
        queryClient.invalidateQueries({
          queryKey: testCaseQueryKeys.detail(testCase.id),
        }),
      ]);
    },
  });
};

export const useArchiveTestCase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: testCasesApi.archive,
    onSuccess: async (testCase) => {
      await Promise.all([
        invalidateTestCaseViews(queryClient, testCase.specVersionId),
        queryClient.invalidateQueries({
          queryKey: testCaseQueryKeys.detail(testCase.id),
        }),
      ]);
    },
  });
};
