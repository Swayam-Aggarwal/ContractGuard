
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "../lib/api.js";

import {
  testCaseQueryKeys,
} from "./testCases.js";

import {
  diffReportQueryKeys,
} from "./comparisons/diffReports.js";

const SUPPORTED_OPERATION_IDS = new Set([
  "listProducts",
  "getProduct",
]);

export const aiTestSuggestionApi = {
  generate: async ({
    projectId,
    reportId,
    operationId,
  }) => {
    if (!SUPPORTED_OPERATION_IDS.has(operationId)) {
      throw new Error(
        "Select one supported Demo Store operation."
      );
    }

    const data = await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}` +
        `/diff-reports/${encodeURIComponent(reportId)}` +
        `/ai-test-suggestions`,
      {
        method: "POST",

        body: {
          operationId,
          consent: true,
        },
      }
    );

    return data;
  },
};

export const useGenerateAiTestSuggestions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: aiTestSuggestionApi.generate,

    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: testCaseQueryKeys.specification(
            result.specVersionId
          ),
        }),

        queryClient.invalidateQueries({
          queryKey: diffReportQueryKeys.all,
        }),
      ]);
    },
  });
};
