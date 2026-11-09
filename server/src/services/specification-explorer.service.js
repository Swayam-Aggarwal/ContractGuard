
import specVersionService from "./specVersion.service.js";

import createOperationIndex from
  "./openapi-operation-index.service.js";

import createOpenApiReferenceService from
  "./openapi-reference.service.js";

import {
  OPENAPI_COMPONENT_TYPES,
} from "../constants/openapi.js";

import {
  encodeJsonPointer,
} from "../utils/jsonPointer.js";

import AppError from "../utils/appError.js";

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const createResourceNotFoundError = (message) =>
  new AppError(message, {
    statusCode: 404,
    code: "RESOURCE_NOT_FOUND",
  });

const createValidationError = (message, field) =>
  new AppError(message, {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    details: [
      {
        field,
        message,
      },
    ],
  });

const toPublicWarnings = (warnings = []) =>
  warnings.map((warning) => ({
    field: warning.field,
    message: warning.message,
  }));

const toPublicSpecificationSummary = (specification) => ({
  id: specification._id.toString(),
  projectId: specification.projectId.toString(),
  label: specification.label,
  openapiVersion: specification.openapiVersion,
  title: specification.title,
  operationCount: specification.operationCount,
  parseStatus: specification.parseStatus,
  explorerCompleteness:
    specification.explorerCompleteness ?? "PARTIAL",
  warnings: toPublicWarnings(specification.warnings),
  explorerWarnings: toPublicWarnings(
    specification.explorerWarnings
  ),
  createdAt: specification.createdAt,
});

const getSchemaNavigation = (document) => {
  const schemas = document.components?.schemas;

  if (!isRecord(schemas)) return [];

  return Object.entries(schemas)
    .map(([name, schema]) => {
      const properties = isRecord(schema?.properties)
        ? schema.properties
        : {};

      const requiredProperties = Array.isArray(schema?.required)
        ? schema.required.filter(
            (property) => typeof property === "string"
          )
        : [];

      let type = null;

      if (typeof schema?.type === "string") {
        type = schema.type;
      } else if (Array.isArray(schema?.type)) {
        type = schema.type.join(" | ");
      }

      return {
        name,
        type,
        description:
          typeof schema?.description === "string"
            ? schema.description
            : null,
        format:
          typeof schema?.format === "string"
            ? schema.format
            : null,
        enumValues: Array.isArray(schema?.enum)
          ? schema.enum
          : [],
        propertyNames: Object.keys(properties).sort(),
        requiredProperties,
        compositionKeywords: [
          "allOf",
          "oneOf",
          "anyOf",
          "not",
        ].filter((keyword) =>
          Object.hasOwn(schema ?? {}, keyword)
        ),
        discriminator: schema?.discriminator ?? null,
        deprecated: schema?.deprecated === true,
        readOnly: schema?.readOnly === true,
        writeOnly: schema?.writeOnly === true,
        pointer: encodeJsonPointer([
          "components",
          "schemas",
          name,
        ]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

const getComponentCategories = (document) => {
  const components = isRecord(document.components)
    ? document.components
    : {};

  return OPENAPI_COMPONENT_TYPES.map((type) => ({
    type,
    count: isRecord(components[type])
      ? Object.keys(components[type]).length
      : 0,
  }));
};

const isOpenApi31OrLater = (openapiVersion) =>
  /^3\.[12]\./u.test(openapiVersion || "");

const resolveReferencedObject = (
  value,
  references,
  openapiVersion,
  {
    kind = "referenceObject",
    sourcePointer = null,
  } = {}
) => {
  if (!isRecord(value) || typeof value.$ref !== "string") {
    return {
      value,
      reference: null,
    };
  }

  const result = references.resolveObject(value, {
    sourcePointer,
  });

  const reference = {
    ref: value.$ref,
    targetPointer: result.targetPointer,
    chain: result.chain,
    circular: result.circular,
  };

  if (result.circular) {
    return {
      value,
      reference,
    };
  }

  if (!isRecord(result.value)) {
    return {
      value: result.value,
      reference,
    };
  }

  let resolvedValue = result.value;

  if (kind === "schema") {
    // OpenAPI 3.0 Schema Object $ref siblings are ignored.
    if (!isOpenApi31OrLater(openapiVersion)) {
      return {
        value: resolvedValue,
        reference,
      };
    }

    // OpenAPI 3.1+ Schema Object $ref siblings follow
    // JSON Schema semantics: they are evaluated alongside
    // the referenced schema, not by overwriting it.
    const siblings = Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => key !== "$ref"
      )
    );

    if (Object.keys(siblings).length > 0) {
      resolvedValue = {
        allOf: [
          resolvedValue,
          siblings,
        ],
      };
    }

    return {
      value: resolvedValue,
      reference,
    };
  }

  if (kind === "pathItem") {
    const siblingFields = Object.keys(value).filter(
      (key) => key !== "$ref"
    );

    if (siblingFields.length > 0) {
      reference.unsupportedSiblingFields = siblingFields;
    }

    // Path Item $ref siblings are not silently merged.
    return {
      value: resolvedValue,
      reference,
    };
  }

  // OpenAPI 3.0 Reference Objects ignore all sibling fields.
  if (!isOpenApi31OrLater(openapiVersion)) {
    return {
      value: resolvedValue,
      reference,
    };
  }

  // OpenAPI 3.1+ Reference Objects permit summary and
  // description overrides only.
  resolvedValue = {
    ...resolvedValue,
    ...(typeof value.summary === "string"
      ? { summary: value.summary }
      : {}),
    ...(typeof value.description === "string"
      ? { description: value.description }
      : {}),
  };

  return {
    value: resolvedValue,
    reference,
  };
};

const resolveParameter = (
  parameter,
  references,
  openapiVersion
) => {
  const result = resolveReferencedObject(
    parameter,
    references,
    openapiVersion
  );

  if (!result.reference || !isRecord(result.value)) {
    return result.value;
  }

  return {
    ...result.value,
    reference: result.reference,
  };
};

// Operation-level parameters override path-level parameters
// having the same name and location. HTTP header names are
// case-insensitive; other parameter names retain their case.
const mergeParameters = (
  pathParameters,
  operationParameters,
  references,
  openapiVersion
) => {
  const merged = Array.isArray(pathParameters)
    ? pathParameters.map((parameter) =>
        resolveParameter(
          parameter,
          references,
          openapiVersion
        )
      )
    : [];

  const operationEntries = Array.isArray(operationParameters)
    ? operationParameters.map((parameter) =>
        resolveParameter(
          parameter,
          references,
          openapiVersion
        )
      )
    : [];

  for (const parameter of operationEntries) {
    const hasIdentity =
      isRecord(parameter) &&
      typeof parameter.name === "string" &&
      typeof parameter.in === "string";

    if (!hasIdentity) {
      merged.push(parameter);
      continue;
    }

    const normalizedName = parameter.in === "header"
      ? parameter.name.toLowerCase()
      : parameter.name;

    const existingIndex = merged.findIndex((existing) => {
      if (
        !isRecord(existing) ||
        typeof existing.name !== "string" ||
        typeof existing.in !== "string"
      ) {
        return false;
      }

      const existingName = existing.in === "header"
        ? existing.name.toLowerCase()
        : existing.name;

      return (
        existing.in === parameter.in &&
        existingName === normalizedName
      );
    });

    if (existingIndex === -1) {
      merged.push(parameter);
    } else {
      merged[existingIndex] = parameter;
    }
  }

  return merged;
};

const resolveOperationResponses = (
  responses,
  references,
  openapiVersion
) => {
  if (!isRecord(responses)) {
    return {
      responses: {},
      responseReferences: {},
    };
  }

  const resolvedResponses = {};
  const responseReferences = {};

  for (const [statusCode, response] of Object.entries(responses)) {
    const result = resolveReferencedObject(
      response,
      references,
      openapiVersion,
      {
        sourcePointer: `responses.${statusCode}`,
      }
    );

    resolvedResponses[statusCode] = result.value;

    if (result.reference) {
      responseReferences[statusCode] = result.reference;
    }
  }

  return {
    responses: resolvedResponses,
    responseReferences,
  };
};

const getSpecificationContext = async (
  ownerId,
  specVersionId
) => {
  const specification =
    await specVersionService.getSpecificationVersionRecord(
      ownerId,
      specVersionId
    );

  const document = specification.document;

  return {
    specification,
    document,
    references: createOpenApiReferenceService(document),
  };
};

const listSpecificationOperations = async (
  ownerId,
  specVersionId
) => {
  const {
    specification,
    document,
  } = await getSpecificationContext(
    ownerId,
    specVersionId
  );

  const operations = createOperationIndex(document);
  const schemas = getSchemaNavigation(document);

  return {
    specification: toPublicSpecificationSummary(specification),
    operations,
    schemas,
    componentCategories: getComponentCategories(document),
  };
};

const getSpecificationOperation = async (
  ownerId,
  specVersionId,
  operationKey
) => {
  const {
    specification,
    document,
    references,
  } = await getSpecificationContext(
    ownerId,
    specVersionId
  );

  const operations = createOperationIndex(document);

  const operationSummary = operations.find(
    (operation) => operation.operationKey === operationKey
  );

  if (!operationSummary) {
    throw createResourceNotFoundError("Operation not found.");
  }

  const operationResult = references.getValueAtPointer(
    operationSummary.sourcePointer
  );

  const pathItemResult = references.getValueAtPointer(
    operationSummary.pathItemPointer
  );

  const operation = operationResult.value;
  const pathItem = pathItemResult.value;

  if (!isRecord(operation) || !isRecord(pathItem)) {
    throw createResourceNotFoundError("Operation not found.");
  }

  const servers = Array.isArray(operation.servers)
    ? operation.servers
    : Array.isArray(pathItem.servers)
      ? pathItem.servers
      : Array.isArray(document.servers)
        ? document.servers
        : [];

  const security = Object.hasOwn(operation, "security")
    ? operation.security
    : document.security ?? [];

  const requestBodyResult = resolveReferencedObject(
    operation.requestBody ?? null,
    references,
    document.openapi,
    {
      sourcePointer: `${operationSummary.sourcePointer}.requestBody`,
    }
  );

  const responseResult = resolveOperationResponses(
    operation.responses,
    references,
    document.openapi
  );

  const operationDetail = {
    ...operationSummary,

    parameters: mergeParameters(
      pathItem.parameters,
      operation.parameters,
      references,
      document.openapi
    ),

    requestBody: operation.requestBody ?? null,
    resolvedRequestBody: requestBodyResult.value,
    requestBodyReference: requestBodyResult.reference,

    responses: isRecord(operation.responses)
      ? operation.responses
      : {},

    resolvedResponses: responseResult.responses,
    responseReferences: responseResult.responseReferences,

    security,
    servers,

    pathSummary:
      typeof pathItem.summary === "string"
        ? pathItem.summary
        : null,

    pathDescription:
      typeof pathItem.description === "string"
        ? pathItem.description
        : null,

    externalDocs: operation.externalDocs ?? null,
    operation,
  };

  return {
    specification: toPublicSpecificationSummary(specification),
    operation: operationDetail,
    schemas: getSchemaNavigation(document),
    componentCategories: getComponentCategories(document),
  };
};

const listSpecificationComponents = async (
  ownerId,
  specVersionId,
  componentType
) => {
  if (!OPENAPI_COMPONENT_TYPES.includes(componentType)) {
    throw createValidationError(
      "Unsupported OpenAPI component category.",
      "componentType"
    );
  }

  const {
    specification,
    document,
  } = await getSpecificationContext(
    ownerId,
    specVersionId
  );

  const components = isRecord(document.components?.[componentType])
    ? document.components[componentType]
    : {};

  const entries = Object.entries(components)
    .map(([name, value]) => ({
      name,
      pointer: encodeJsonPointer([
        "components",
        componentType,
        name,
      ]),
      isReference:
        isRecord(value) &&
        typeof value.$ref === "string",
      summary:
        typeof value?.summary === "string"
          ? value.summary
          : null,
      description:
        typeof value?.description === "string"
          ? value.description
          : null,
      type:
        typeof value?.type === "string"
          ? value.type
          : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    specification: toPublicSpecificationSummary(specification),
    componentType,
    count: entries.length,
    components: entries,
  };
};

const getSpecificationComponent = async (
  ownerId,
  specVersionId,
  componentType,
  componentName
) => {
  if (!OPENAPI_COMPONENT_TYPES.includes(componentType)) {
    throw createValidationError(
      "Unsupported OpenAPI component category.",
      "componentType"
    );
  }

  const {
    specification,
    document,
    references,
  } = await getSpecificationContext(
    ownerId,
    specVersionId
  );

  const componentPointer = encodeJsonPointer([
    "components",
    componentType,
    componentName,
  ]);

  let componentResult;

  try {
    componentResult = references.getValueAtPointer(
      componentPointer
    );
  } catch {
    throw createResourceNotFoundError(
      "The requested component was not found."
    );
  }

  let kind = "referenceObject";

  if (componentType === "schemas") {
    kind = "schema";
  } else if (componentType === "pathItems") {
    kind = "pathItem";
  }

  const resolution = resolveReferencedObject(
    componentResult.value,
    references,
    document.openapi,
    {
      kind,
      sourcePointer: componentPointer,
    }
  );

  return {
    specification: toPublicSpecificationSummary(specification),
    componentType,
    componentName,
    pointer: componentPointer,
    component: componentResult.value,
    resolvedComponent: resolution.value,
    reference: resolution.reference,
  };
};

const getSpecificationReference = async (
  ownerId,
  specVersionId,
  reference
) => {
  const {
    specification,
    references,
  } = await getSpecificationContext(
    ownerId,
    specVersionId
  );

  const result = references.resolveReferenceChain(reference);

  return {
    specification: toPublicSpecificationSummary(specification),
    reference,
    targetPointer: result.targetPointer,
    chain: result.chain,
    circular: result.circular,
    value: result.value,
  };
};

const specificationExplorerService = {
  listSpecificationOperations,
  getSpecificationOperation,
  listSpecificationComponents,
  getSpecificationComponent,
  getSpecificationReference,
};

export default specificationExplorerService;
