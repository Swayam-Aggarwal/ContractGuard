import AppError from "../utils/appError.js";

import {
  getJsonPointerValue,
  parseJsonPointer,
  resolveJsonPointer,
  encodeJsonPointer,
} from "../utils/jsonPointer.js";

import {
  MAX_EXPLORER_REFERENCE_DEPTH,
} from "../constants/openapi.js";

import {
  registerOpenApiDocumentContext,
} from "./openapi-schema-normalization.service.js";

const isRecord = (value) => {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
};

const createReferenceNotFoundError = (reference) =>
  new AppError("The requested internal reference was not found.", {
    statusCode: 404,
    code: "RESOURCE_NOT_FOUND",
    details: [
      {
        field: "ref",
        message: `Reference target ${reference} does not exist in this specification.`,
      },
    ],
  });

const createReferenceLimitError = () =>
  new AppError(
    `The reference chain exceeds the maximum depth of ${MAX_EXPLORER_REFERENCE_DEPTH}.`,
    {
      statusCode: 422,
      code: "SPEC_LIMIT_EXCEEDED",
    }
  );

const createOpenApiReferenceService = (document) => {
  if (!isRecord(document)) {
    throw new TypeError("An OpenAPI document object is required.");
  }

  // Register version/dialect context against the original object graph.
  // WeakMap registration does not mutate or clone uploaded specification data.
  registerOpenApiDocumentContext(document);

  const getReferenceTarget = (reference) => {
    const result = resolveJsonPointer(document, reference);

    if (!result.found) {
      throw createReferenceNotFoundError(reference);
    }

    return result;
  };

  const resolveReferenceChain = (
    reference,
    { maxDepth = MAX_EXPLORER_REFERENCE_DEPTH } = {}
  ) => {
    if (
      !Number.isInteger(maxDepth) ||
      maxDepth < 1 ||
      maxDepth > MAX_EXPLORER_REFERENCE_DEPTH
    ) {
      throw new TypeError("maxDepth is outside the supported range.");
    }

    const chain = [];
    const visited = new Set();

    let currentReference = reference;
    let currentTarget;

    for (let depth = 1; depth <= maxDepth; depth += 1) {
      if (visited.has(currentReference)) {
        return {
          reference,
          targetPointer: currentTarget?.pointer ?? null,
          value: currentTarget?.value,
          chain,
          circular: true,
        };
      }

      visited.add(currentReference);

      currentTarget = getReferenceTarget(currentReference);

      chain.push({
        reference: currentReference,
        targetPointer: currentTarget.pointer,
      });

      const nextReference =
        isRecord(currentTarget.value) &&
        typeof currentTarget.value.$ref === "string"
          ? currentTarget.value.$ref
          : null;

      if (!nextReference) {
        return {
          reference,
          targetPointer: currentTarget.pointer,
          value: currentTarget.value,
          chain,
          circular: false,
        };
      }

      if (visited.has(nextReference)) {
        return {
          reference,
          targetPointer: currentTarget.pointer,
          value: currentTarget.value,
          chain,
          circular: true,
        };
      }

      if (depth === maxDepth) {
        throw createReferenceLimitError();
      }

      currentReference = nextReference;
    }

    throw createReferenceLimitError();
  };

  const resolveObject = (
    value,
    {
      sourcePointer = null,
      maxDepth = MAX_EXPLORER_REFERENCE_DEPTH,
    } = {}
  ) => {
    if (!isRecord(value) || typeof value.$ref !== "string") {
      return {
        value,
        sourcePointer,
        targetPointer: sourcePointer,
        chain: [],
        circular: false,
        referenced: false,
      };
    }

    const result = resolveReferenceChain(value.$ref, { maxDepth });

    return {
      value: result.value,
      sourcePointer,
      targetPointer: result.targetPointer,
      chain: result.chain,
      circular: result.circular,
      referenced: true,
    };
  };

  const getValueAtPointer = (pointer) => {
    const segments = parseJsonPointer(pointer);
    const result = getJsonPointerValue(document, segments);

    if (!result.found) {
      throw createReferenceNotFoundError(pointer);
    }

    return {
      value: result.value,
      pointer: encodeJsonPointer(segments),
      segments,
    };
  };

  return Object.freeze({
    getReferenceTarget,
    resolveReferenceChain,
    resolveObject,
    getValueAtPointer,
  });
};

export default createOpenApiReferenceService;