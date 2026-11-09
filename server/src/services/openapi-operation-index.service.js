
import { createHash } from "node:crypto";

import AppError from "../utils/appError.js";

import {
  ADDITIONAL_OPERATION_METHOD_PATTERN,
  MAX_EXPLORER_CALLBACK_DEPTH,
  STANDARD_HTTP_METHODS,
} from "../constants/openapi.js";

import createOpenApiReferenceService from "./openapi-reference.service.js";

import {
  encodeJsonPointer,
  parseJsonPointer,
} from "../utils/jsonPointer.js";

const MAX_INDEXED_OPERATIONS = 500;

const isRecord = (value) => {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
};

const createOperationKey = (
  method,
  path,
  {
    kind = "path",
    sourcePointer = null,
    parentOperationKey = null,
  } = {}
) => {
  // Standard path operations retain their original key format.
  // Additional operations retain their exact HTTP method capitalization.
  const identity = kind === "path"
    ? `${method} ${path}`
    : `${kind}\u0000${method}\u0000${path}\u0000${sourcePointer ?? ""}\u0000${parentOperationKey ?? ""}`;

  const hash = createHash("sha256")
    .update(identity, "utf8")
    .digest("base64url");

  return `op_${hash}`;
};

const createIndexLimitError = (message) =>
  new AppError(message, {
    statusCode: 422,
    code: "SPEC_LIMIT_EXCEEDED",
  });

const createUnsupportedPathItemReferenceError = (
  pointer,
  siblingFields
) =>
  new AppError(
    "Path Item references with adjacent fields are not supported.",
    {
      statusCode: 422,
      code: "SPEC_UNSUPPORTED_CONSTRUCT",
      details: [
        {
          field: pointer,
          message:
            `Move these fields into the referenced Path Item: ${siblingFields.join(", ")}.`,
        },
      ],
    }
  );

const getEffectiveParameterCount = (...parameterGroups) => {
  const identities = new Set();
  let unidentifiedCount = 0;

  for (const parameters of parameterGroups) {
    if (!Array.isArray(parameters)) {
      continue;
    }

    for (const parameter of parameters) {
      if (
        isRecord(parameter) &&
        typeof parameter.name === "string" &&
        typeof parameter.in === "string"
      ) {
        const location = parameter.in === "header"
          ? "header"
          : parameter.in;

        const name = location === "header"
          ? parameter.name.toLowerCase()
          : parameter.name;

        identities.add(`${location}\u0000${name}`);
      } else if (
        isRecord(parameter) &&
        typeof parameter.$ref === "string"
      ) {
        identities.add(`$ref\u0000${parameter.$ref}`);
      } else {
        unidentifiedCount += 1;
      }
    }
  }

  return identities.size + unidentifiedCount;
};

const getOperationMetadata = ({
  kind,
  path,
  method,
  operation,
  pathItem,
  sourcePointer,
  pathItemPointer,
  sourceName = null,
  callbackName = null,
  parentOperationKey = null,
}) => {
  const responseCodes = isRecord(operation.responses)
    ? Object.keys(operation.responses).sort()
    : [];

  return {
    operationKey: createOperationKey(method, path, {
      kind,
      sourcePointer,
      parentOperationKey,
    }),
    kind,
    method,
    path,
    operationId:
      typeof operation.operationId === "string"
        ? operation.operationId
        : null,
    summary:
      typeof operation.summary === "string"
        ? operation.summary
        : null,
    description:
      typeof operation.description === "string"
        ? operation.description
        : null,
    tags: Array.isArray(operation.tags)
      ? operation.tags.filter(
          (tag) => typeof tag === "string"
        )
      : [],
    deprecated: operation.deprecated === true,
    parameterCount: getEffectiveParameterCount(
      pathItem.parameters,
      operation.parameters
    ),
    hasRequestBody: Object.hasOwn(operation, "requestBody"),
    responseCodes,
    sourcePointer,
    pathItemPointer,
    sourceName,
    callbackName,
    parentOperationKey,
  };
};

const resolvePathItem = (pathItem, pointer, references) => {
  if (!isRecord(pathItem) || typeof pathItem.$ref !== "string") {
    return {
      value: pathItem,
      pointer,
      circular: false,
    };
  }

  const siblingFields = Object.keys(pathItem).filter(
    (field) => field !== "$ref"
  );

  // Do not silently discard Path Item siblings.
  // Their merging rules and conflicting-field behavior require special handling.
  if (siblingFields.length > 0) {
    throw createUnsupportedPathItemReferenceError(
      pointer,
      siblingFields
    );
  }

  const result = references.resolveObject(pathItem, {
    sourcePointer: pointer,
  });

  if (result.circular) {
    return {
      value: null,
      pointer: result.targetPointer,
      circular: true,
    };
  }

  if (!isRecord(result.value)) {
    throw new AppError(
      "The Path Item reference does not resolve to a valid object.",
      {
        statusCode: 422,
        code: "SPEC_INVALID",
        details: [
          {
            field: pointer,
            message:
              "The referenced value must be an OpenAPI Path Item Object.",
          },
        ],
      }
    );
  }

  return {
    value: result.value,
    pointer: result.targetPointer,
    circular: false,
  };
};

const appendPointer = (pointer, ...segments) => {
  return encodeJsonPointer([
    ...parseJsonPointer(pointer),
    ...segments.map(String),
  ]);
};

export const createOperationIndex = (document) => {
  if (!isRecord(document)) {
    throw new TypeError("An OpenAPI document object is required.");
  }

  const references = createOpenApiReferenceService(document);

  const operations = [];
  const visitedCallbackPointers = new Set();

  let callbackDepthExceeded = false;

  const addOperation = (metadata) => {
    if (operations.length >= MAX_INDEXED_OPERATIONS) {
      throw createIndexLimitError(
        `The explorer exceeds its maximum of ${MAX_INDEXED_OPERATIONS} indexed operations.`
      );
    }

    operations.push(metadata);
  };

  const addPathItemOperations = ({
    pathItem,
    pathItemPointer,
    path,
    kind,
    sourceName = null,
    callbackName = null,
    parentOperationKey = null,
    callbackDepth = 0,
  }) => {
    const resolvedPathItem = resolvePathItem(
      pathItem,
      pathItemPointer,
      references
    );

    if (
      !isRecord(resolvedPathItem.value) ||
      resolvedPathItem.circular
    ) {
      return;
    }

    const effectivePathItem = resolvedPathItem.value;
    const effectivePathItemPointer = resolvedPathItem.pointer;

    const operationDefinitions = [];

    // Standard methods, including OpenAPI QUERY.
    for (const method of STANDARD_HTTP_METHODS) {
      if (!Object.hasOwn(effectivePathItem, method)) {
        continue;
      }

      if (!isRecord(effectivePathItem[method])) {
        continue;
      }

      operationDefinitions.push({
        method: method.toUpperCase(),
        operation: effectivePathItem[method],
        sourcePointer: appendPointer(
          effectivePathItemPointer,
          method
        ),
      });
    }

    // Custom HTTP methods retain their declared capitalization.
    if (isRecord(effectivePathItem.additionalOperations)) {
      for (const [method, operation] of Object.entries(
        effectivePathItem.additionalOperations
      )) {
        if (
          !ADDITIONAL_OPERATION_METHOD_PATTERN.test(method) ||
          STANDARD_HTTP_METHODS.includes(method.toLowerCase()) ||
          !isRecord(operation)
        ) {
          continue;
        }

        operationDefinitions.push({
          method,
          operation,
          sourcePointer: appendPointer(
            effectivePathItemPointer,
            "additionalOperations",
            method
          ),
        });
      }
    }

    for (const definition of operationDefinitions) {
      const metadata = getOperationMetadata({
        kind,
        path,
        method: definition.method,
        operation: definition.operation,
        pathItem: effectivePathItem,
        sourcePointer: definition.sourcePointer,
        pathItemPointer: effectivePathItemPointer,
        sourceName,
        callbackName,
        parentOperationKey,
      });

      addOperation(metadata);

      const callbacks = definition.operation.callbacks;

      if (!isRecord(callbacks) || Object.keys(callbacks).length === 0) {
        continue;
      }

      if (callbackDepth >= MAX_EXPLORER_CALLBACK_DEPTH) {
        callbackDepthExceeded = true;
        continue;
      }

      for (const [name, callbackDefinition] of Object.entries(callbacks)) {
        const callbackPointer = appendPointer(
          definition.sourcePointer,
          "callbacks",
          name
        );

        const resolvedCallback = references.resolveObject(
          callbackDefinition,
          {
            sourcePointer: callbackPointer,
          }
        );

        if (
          !isRecord(resolvedCallback.value) ||
          resolvedCallback.circular
        ) {
          continue;
        }

        const callbackObjectPointer = resolvedCallback.targetPointer;

        if (visitedCallbackPointers.has(callbackObjectPointer)) {
          continue;
        }

        visitedCallbackPointers.add(callbackObjectPointer);

        try {
          for (const [expression, callbackPathItem] of Object.entries(
            resolvedCallback.value
          )) {
            if (!isRecord(callbackPathItem)) {
              continue;
            }

            const callbackPathItemPointer = appendPointer(
              callbackObjectPointer,
              expression
            );

            addPathItemOperations({
              pathItem: callbackPathItem,
              pathItemPointer: callbackPathItemPointer,
              path: expression,
              kind: "callback",
              sourceName,
              callbackName: callbackName
                ? `${callbackName}.${name}`
                : name,
              parentOperationKey: metadata.operationKey,
              callbackDepth: callbackDepth + 1,
            });
          }
        } finally {
          visitedCallbackPointers.delete(callbackObjectPointer);
        }
      }
    }
  };

  const pathCollections = [
    {
      kind: "path",
      collectionName: "paths",
      collection: isRecord(document.paths)
        ? document.paths
        : {},
    },
    {
      kind: "webhook",
      collectionName: "webhooks",
      collection: isRecord(document.webhooks)
        ? document.webhooks
        : {},
    },
  ];

  for (const pathCollection of pathCollections) {
    for (const [path, pathItem] of Object.entries(
      pathCollection.collection
    )) {
      const pathItemPointer = encodeJsonPointer([
        pathCollection.collectionName,
        path,
      ]);

      addPathItemOperations({
        pathItem,
        pathItemPointer,
        path,
        kind: pathCollection.kind,
        sourceName: pathCollection.collectionName === "webhooks"
          ? path
          : null,
      });
    }
  }

  if (callbackDepthExceeded) {
    throw createIndexLimitError(
      `The explorer cannot index callbacks nested deeper than ${MAX_EXPLORER_CALLBACK_DEPTH} levels.`
    );
  }

  return operations.sort((left, right) => {
    const kindComparison = left.kind.localeCompare(right.kind);

    if (kindComparison !== 0) {
      return kindComparison;
    }

    const pathComparison = left.path.localeCompare(right.path);

    if (pathComparison !== 0) {
      return pathComparison;
    }

    const methodComparison = left.method.localeCompare(right.method);

    if (methodComparison !== 0) {
      return methodComparison;
    }

    return left.sourcePointer.localeCompare(right.sourcePointer);
  });
};

export default createOperationIndex;
