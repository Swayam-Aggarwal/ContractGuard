import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "../../lib/api.js";
import { projectQueryKeys } from "../projects/projects.js";

export const SPECIFICATION_MAX_FILE_SIZE = 1024 * 1024;

export const specificationQueryKeys = {
  all: ["specifications"],

  project: (projectId) => [
    "specifications",
    "project",
    projectId,
  ],

  operations: (specVersionId) => [
    "specifications",
    "operations",
    specVersionId,
  ],

  operation: (specVersionId, operationKey) => [
    "specifications",
    "operation",
    specVersionId,
    operationKey,
  ],

  components: (specVersionId, componentType) => [
    "specifications",
    "components",
    specVersionId,
    componentType,
  ],

  component: (specVersionId, componentType, componentName) => [
    "specifications",
    "component",
    specVersionId,
    componentType,
    componentName,
  ],

  reference: (specVersionId, reference) => [
    "specifications",
    "reference",
    specVersionId,
    reference,
  ],
};

export const specificationsApi = {
  list: async (projectId) => {
    const data = await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}/specifications`
    );

    return data.specifications;
  },

  upload: async ({ projectId, file, label }) => {
    const formData = new FormData();

    formData.append("file", file, file.name);

    if (typeof label === "string" && label.trim()) {
      formData.append("label", label.trim());
    }

    const data = await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}/specifications`,
      {
        method: "POST",
        body: formData,
      }
    );

    return data.specification;
  },

  listOperations: async (specVersionId) => {
    return apiRequest(
      `/api/v1/specifications/${encodeURIComponent(specVersionId)}/operations`
    );
  },

  getOperation: async ({ specVersionId, operationKey }) => {
    return apiRequest(
      `/api/v1/specifications/${encodeURIComponent(specVersionId)}/operations/${encodeURIComponent(operationKey)}`
    );
  },

  listComponents: async ({ specVersionId, componentType }) => {
    return apiRequest(
      `/api/v1/specifications/${encodeURIComponent(specVersionId)}/components/${encodeURIComponent(componentType)}`
    );
  },

  getComponent: async ({
    specVersionId,
    componentType,
    componentName,
  }) => {
    return apiRequest(
      `/api/v1/specifications/${encodeURIComponent(specVersionId)}/components/${encodeURIComponent(componentType)}/${encodeURIComponent(componentName)}`
    );
  },

  getReference: async ({ specVersionId, reference }) => {
    return apiRequest(
      `/api/v1/specifications/${encodeURIComponent(specVersionId)}/references?ref=${encodeURIComponent(reference)}`
    );
  },
};

export const useSpecificationVersions = (projectId) => {
  return useQuery({
    queryKey: specificationQueryKeys.project(projectId),
    queryFn: () => specificationsApi.list(projectId),
    enabled: Boolean(projectId),
  });
};

export const useUploadSpecification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: specificationsApi.upload,

    onSuccess: async (_specification, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: specificationQueryKeys.project(
            variables.projectId
          ),
        }),

        queryClient.invalidateQueries({
          queryKey: projectQueryKeys.detail(
            variables.projectId
          ),
        }),

        queryClient.invalidateQueries({
          queryKey: projectQueryKeys.list,
        }),
      ]);
    },
  });
};

export const useSpecificationOperations = (specVersionId) => {
  return useQuery({
    queryKey: specificationQueryKeys.operations(specVersionId),
    queryFn: () =>
      specificationsApi.listOperations(specVersionId),
    enabled: Boolean(specVersionId),
  });
};

export const useSpecificationOperation = (
  specVersionId,
  operationKey
) => {
  return useQuery({
    queryKey: specificationQueryKeys.operation(
      specVersionId,
      operationKey
    ),

    queryFn: () =>
      specificationsApi.getOperation({
        specVersionId,
        operationKey,
      }),

    enabled: Boolean(specVersionId && operationKey),
  });
};

export const useSpecificationComponents = (
  specVersionId,
  componentType
) => {
  return useQuery({
    queryKey: specificationQueryKeys.components(
      specVersionId,
      componentType
    ),

    queryFn: () =>
      specificationsApi.listComponents({
        specVersionId,
        componentType,
      }),

    enabled: Boolean(specVersionId && componentType),
  });
};

export const useSpecificationComponent = (
  specVersionId,
  componentType,
  componentName
) => {
  return useQuery({
    queryKey: specificationQueryKeys.component(
      specVersionId,
      componentType,
      componentName
    ),

    queryFn: () =>
      specificationsApi.getComponent({
        specVersionId,
        componentType,
        componentName,
      }),

    enabled: Boolean(
      specVersionId &&
      componentType &&
      componentName
    ),
  });
};

export const useSpecificationReference = (
  specVersionId,
  reference,
  enabled = false
) => {
  return useQuery({
    queryKey: specificationQueryKeys.reference(
      specVersionId,
      reference
    ),

    queryFn: () =>
      specificationsApi.getReference({
        specVersionId,
        reference,
      }),

    enabled: Boolean(specVersionId && reference && enabled),
  });
};