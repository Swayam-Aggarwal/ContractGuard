import AppError from "../utils/appError.js";
import createOperationIndex from "./openapi-operation-index.service.js";

import {
  matchOpenApiOperations,
} from "./openapi-path-normalization.service.js";

import createOpenApiReferenceService from "./openapi-reference.service.js";
import compareSchemas from "./schema-compatibility.service.js";

import {
  COMPATIBILITY_DIRECTION,
  COMPATIBILITY_RULESET_VERSION,
  createClassificationSummary,
  createFindingContract,
} from "./compatibility-report-contract.js";

const MAX_CHANGES = 2000;
const MAX_WARNINGS = 100;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
  );
};

const stableSerialize = (value) => JSON.stringify(stableValue(value));

const statusCoveredBy = (status, responses) => {
  if (
    Object.hasOwn(responses, status) ||
    Object.hasOwn(responses, "default")
  ) return true;

  if (/^[1-5]\d\d$/u.test(status)) {
    return Object.hasOwn(responses, `${status[0]}XX`);
  }

  if (/^[1-5]XX$/u.test(status)) {
    return Object.hasOwn(responses, "default");
  }

  return false;
};

const mediaTypeCoveredBy = (mediaType, content) => {
  const names = Object.keys(content).map((name) => name.toLowerCase());
  const normalized = mediaType.toLowerCase();

  if (names.includes(normalized) || names.includes("*/*")) return true;

  const slash = normalized.indexOf("/");

  return slash > 0 && names.includes(`${normalized.slice(0, slash)}/*`);
};

const normalizeParameter = (parameter) => {
  const result = { ...parameter };
  const location = result.in;

  result.style ??=
    location === "path" || location === "header"
      ? "simple"
      : "form";

  result.explode ??= result.style === "form";
  result.allowReserved ??= false;
  result.allowEmptyValue ??= false;
  result.required ??= location === "path";

  return result;
};

const compareCompatibility = (
  baselineDocument,
  candidateDocument,
  {
    baselineWarnings = [],
    candidateWarnings = [],
    baselineExplorerWarnings = [],
    candidateExplorerWarnings = [],
  } = {}
) => {
  if (!isRecord(baselineDocument) || !isRecord(candidateDocument)) {
    throw new TypeError(
      "Both baseline and candidate OpenAPI documents are required."
    );
  }

  const baselineRefs = createOpenApiReferenceService(baselineDocument);
  const candidateRefs = createOpenApiReferenceService(candidateDocument);

  const changes = [];
  const warnings = [];
  const warningMetadata = new Map();

  let omittedWarnings = 0;
  let addedOperations = 0;
  let removedOperations = 0;
  let unchangedOperations = 0;

  const addWarning = (field, message, metadata = {}) => {
    const normalized = {
      field: String(field || "document").slice(0, 500),
      message: String(message).slice(0, 1000),
    };

    const key = `${normalized.field}\u0000${normalized.message}`;

    if (
      warnings.some(
        (item) =>
          item.field === normalized.field &&
          item.message === normalized.message
      )
    ) {
      if (metadata && Object.keys(metadata).length > 0) {
        const existing = warningMetadata.get(key) ?? {};
        warningMetadata.set(key, { ...existing, ...metadata });
      }
      return;
    }

    if (warnings.length >= MAX_WARNINGS) {
      omittedWarnings += 1;
      return;
    }

    warnings.push(normalized);

    if (metadata && Object.keys(metadata).length > 0) {
      warningMetadata.set(key, metadata);
    }
  };

  const importWarnings = (items, side, source) => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      addWarning(
        `${side}.${source}.${item?.field || "document"}`,
        item?.message || String(item)
      );
    }
  };

  importWarnings(baselineWarnings, "baseline", "parser");
  importWarnings(candidateWarnings, "candidate", "parser");
  importWarnings(baselineExplorerWarnings, "baseline", "explorer");
  importWarnings(candidateExplorerWarnings, "candidate", "explorer");

  const addChange = (change) => {
    if (changes.length >= MAX_CHANGES) {
      throw new AppError(
        `The comparison exceeds its maximum of ${MAX_CHANGES} changes.`,
        {
          statusCode: 422,
          code: "SPEC_LIMIT_EXCEEDED",
        }
      );
    }

    const legacyChange = {
      category: change.category,
      changeType: change.changeType,
      severity: change.severity,
      breaking: change.severity === "BREAKING",
      path: change.path ?? "",
      method: change.method ?? null,
      operationKey: change.operationKey ?? null,
      field: String(change.field || "document").slice(0, 1000),
      message: String(change.message || "").slice(0, 2000),
      oldValue: change.oldValue ?? null,
      newValue: change.newValue ?? null,
      baselinePointer: change.baselinePointer ?? null,
      candidatePointer: change.candidatePointer ?? null,
      ...(change.ruleId ? { ruleId: change.ruleId } : {}),
      ...(change.classification
        ? { classification: change.classification }
        : {}),
      ...(change.jsonPointer
        ? { jsonPointer: change.jsonPointer }
        : /^components\.|^security\b|^servers\b|^openapi\b|^info\b/u.test(
              String(change.field || "")
            )
          ? {
              jsonPointer: `#/${String(change.field)
                .replace(/^#\/?/u, "")
                .split(".")
                .map((segment) => segment.replace(/~/g, "~0").replace(/\//g, "~1"))
                .join("/")}`,
            }
          : {}),
      ...(change.affectedOperationKeys
        ? { affectedOperationKeys: change.affectedOperationKeys }
        : {}),
      ...(change.summary ? { summary: change.summary } : {}),
      ...(change.rationale ? { rationale: change.rationale } : {}),
    };

    changes.push(createFindingContract(legacyChange));
  };

  const resolveObject = (value, references, document, field) => {
    if (!isRecord(value) || typeof value.$ref !== "string") {
      return value;
    }

    try {
      const result = references.resolveObject(value, {
        sourcePointer: field,
      });

      if (result.circular || !isRecord(result.value)) {
        addWarning(
          field,
          "A circular or invalid reference prevents complete compatibility analysis."
        );

        return null;
      }

      if (!/^3\.[12]\./u.test(document.openapi || "")) {
        return result.value;
      }

      // Only defined Reference Object overrides are applied.
      return {
        ...result.value,
        ...(typeof value.summary === "string"
          ? { summary: value.summary }
          : {}),
        ...(typeof value.description === "string"
          ? { description: value.description }
          : {}),
      };
    } catch {
      addWarning(
        field,
        "The reference could not be resolved during compatibility analysis."
      );

      return null;
    }
  };

  const pointerValue = (references, pointer) => {
    try {
      return references.getValueAtPointer(pointer).value;
    } catch {
      return null;
    }
  };

  const schemaResolver = (references) => (reference) => {
    const result = references.resolveReferenceChain(reference);

    if (result.circular) {
      throw new Error("Circular schema reference.");
    }

    return result.value;
  };

  const baselineSchemaResolver = schemaResolver(baselineRefs);
  const candidateSchemaResolver = schemaResolver(candidateRefs);

  const sameOpenApiVersion =
    baselineDocument.openapi === candidateDocument.openapi;

  const schemaOpenApiVersion = sameOpenApiVersion
    ? baselineDocument.openapi
    : null;

  const validSchema = (container) =>
    isRecord(container) &&
    (
      isRecord(container.schema) ||
      typeof container.schema === "boolean"
    );

  const compareSchemaPresence = (
    oldContainer,
    newContainer,
    context,
    direction,
    field
  ) => {
    const oldHas = validSchema(oldContainer);
    const newHas = validSchema(newContainer);

    const oldInvalid =
      isRecord(oldContainer) &&
      Object.hasOwn(oldContainer, "schema") &&
      !oldHas;

    const newInvalid =
      isRecord(newContainer) &&
      Object.hasOwn(newContainer, "schema") &&
      !newHas;

    if (oldInvalid || newInvalid) {
      addWarning(
        field,
        "A media type contains an unsupported or invalid schema value."
      );
    }

    if (oldHas === newHas) return;

    const schemaAdded = !oldHas && newHas;

    const breaking = direction === "request"
      ? schemaAdded
      : !schemaAdded;

    addChange({
      ...context,
      changeType: schemaAdded
        ? "MEDIA_TYPE_SCHEMA_ADDED"
        : "MEDIA_TYPE_SCHEMA_REMOVED",
      severity: breaking ? "BREAKING" : "NON_BREAKING",
      field,
      message: schemaAdded
        ? `The candidate adds a schema constraint at ${field}.`
        : `The candidate removes the schema constraint at ${field}.`,
      oldValue: oldHas ? oldContainer.schema : null,
      newValue: newHas ? newContainer.schema : null,
    });
  };

  const compareSchema = (
    oldSchema,
    newSchema,
    context,
    direction
  ) => {
    const result = compareSchemas(oldSchema, newSchema, {
      direction,
      field: context.field,
      openApiVersion: schemaOpenApiVersion,
      resolveBaselineReference: baselineSchemaResolver,
      resolveCandidateReference: candidateSchemaResolver,
      allowBaselineRefSiblings:
        /^3\.[12]\./u.test(baselineDocument.openapi || ""),
      allowCandidateRefSiblings:
        /^3\.[12]\./u.test(candidateDocument.openapi || ""),
    });

    for (const warning of result.warnings) {
      addWarning(warning.field, warning.message, {
        path: context.path ?? null,
        method: context.method ?? null,
        operationKey: context.operationKey ?? null,
        baselinePointer: context.baselinePointer ?? null,
        candidatePointer: context.candidatePointer ?? null,
      });
    }

    for (const change of result.changes) {
      addChange({
        ...context,
        ...change,
      });
    }
  };

  const compareContent = (
    oldContent,
    newContent,
    context,
    direction
  ) => {
    const oldTypes = isRecord(oldContent) ? oldContent : {};
    const newTypes = isRecord(newContent) ? newContent : {};

    const oldNames = Object.keys(oldTypes);
    const newNames = Object.keys(newTypes);

    for (const mediaType of oldNames) {
      if (
        newNames.some(
          (name) => name.toLowerCase() === mediaType.toLowerCase()
        )
      ) {
        continue;
      }

      const covered = mediaTypeCoveredBy(mediaType, newTypes);

      const mediaTypeRemovalClassification = direction === "request"
        ? oldNames.length === 1
          ? "BREAKING"
          : "POTENTIALLY_BREAKING"
        : "POTENTIALLY_BREAKING";

      addChange({
        ...context,
        changeType: covered
          ? "MEDIA_TYPE_COVERAGE_CHANGED"
          : "MEDIA_TYPE_REMOVED",
        classification: covered
          ? "UNSUPPORTED"
          : mediaTypeRemovalClassification,
        severity: covered
          ? "INFO"
          : mediaTypeRemovalClassification === "BREAKING"
            ? "BREAKING"
            : "INFO",
        field: `${context.field}.${mediaType}`,
        message: covered
          ? `The ${mediaType} media type is covered by a broader candidate media range; verify content negotiation and schema semantics.`
          : `The candidate removes the ${mediaType} media type.`,
        oldValue: mediaType,
      });

      if (covered) {
        addWarning(
          `${context.field}.${mediaType}`,
          "A broader media-type range may not preserve the removed media type's schema semantics."
        );
      }
    }

    for (const mediaType of newNames) {
      if (
        oldNames.some(
          (name) => name.toLowerCase() === mediaType.toLowerCase()
        )
      ) {
        continue;
      }

      addChange({
        ...context,
        changeType: "MEDIA_TYPE_ADDED",
        severity: "NON_BREAKING",
        field: `${context.field}.${mediaType}`,
        message: `The candidate adds the ${mediaType} media type.`,
        newValue: mediaType,
      });
    }

    for (const mediaType of oldNames) {
      const matching = newNames.find(
        (name) => name.toLowerCase() === mediaType.toLowerCase()
      );

      if (!matching) continue;

      const oldMedia = oldTypes[mediaType];
      const newMedia = newTypes[matching];
      const mediaField = `${context.field}.${mediaType}`;

      if (!isRecord(oldMedia) || !isRecord(newMedia)) {
        if (stableSerialize(oldMedia) !== stableSerialize(newMedia)) {
          addWarning(
            mediaField,
            "Media Type Object changes could not be fully interpreted."
          );
        }

        continue;
      }

      const schemaField = `${mediaField}.schema`;

      compareSchemaPresence(
        oldMedia,
        newMedia,
        context,
        direction,
        schemaField
      );

      if (validSchema(oldMedia) && validSchema(newMedia)) {
        compareSchema(
          oldMedia.schema,
          newMedia.schema,
          {
            ...context,
            field: schemaField,
          },
          direction
        );
      }

      if (
        stableSerialize(oldMedia.encoding ?? {}) !==
        stableSerialize(newMedia.encoding ?? {})
      ) {
        addWarning(
          `${mediaField}.encoding`,
          "Media Type Object encoding changes require manual serialization compatibility review."
        );
      }

      if (
        stableSerialize(oldMedia.examples ?? {}) !==
        stableSerialize(newMedia.examples ?? {})
      ) {
        addChange({
          ...context,
          changeType: "MEDIA_TYPE_EXAMPLES_CHANGED",
          severity: "INFO",
          field: `${mediaField}.examples`,
          message: "Examples for this media type have changed.",
        });
      }
    }
  };

  const getEffectiveParameters = (operation) => {
    const references = operation.side === "baseline"
      ? baselineRefs
      : candidateRefs;

    const document = operation.side === "baseline"
      ? baselineDocument
      : candidateDocument;

    const pathItem = pointerValue(
      references,
      operation.metadata.pathItemPointer
    );

    const operationObject = pointerValue(
      references,
      operation.metadata.sourcePointer
    );

    if (!isRecord(pathItem) || !isRecord(operationObject)) {
      addWarning(
        operation.metadata.sourcePointer,
        "The operation details could not be loaded completely."
      );

      return new Map();
    }

    // First apply OpenAPI's name+location override semantics. Only after
    // resolving those declarations do path parameters receive positional keys.
    const declaredParameters = new Map();

    const addParameters = (parameters, override) => {
      if (!Array.isArray(parameters)) return;

      for (const raw of parameters) {
        const parameter = resolveObject(
          raw,
          references,
          document,
          operation.metadata.sourcePointer
        );

        if (
          !isRecord(parameter) ||
          typeof parameter.name !== "string" ||
          typeof parameter.in !== "string"
        ) {
          addWarning(
            operation.metadata.sourcePointer,
            "A parameter could not be matched by name and location."
          );

          continue;
        }

        const name = parameter.in === "header"
          ? parameter.name.toLowerCase()
          : parameter.name;

        const declaredIdentity = `${parameter.in}\u0000${name}`;

        if (!declaredParameters.has(declaredIdentity) || override) {
          declaredParameters.set(
            declaredIdentity,
            normalizeParameter(parameter)
          );
        }
      }
    };

    addParameters(pathItem.parameters, false);
    addParameters(operationObject.parameters, true);

    const result = new Map();
    const pathParameterNames = operation.metadata.pathParameterNames ?? [];

    for (const parameter of declaredParameters.values()) {
      let identity;

      if (parameter.in === "path") {
        const position = pathParameterNames.indexOf(parameter.name);

        if (position === -1) {
          addWarning(
            operation.metadata.sourcePointer,
            `Path parameter '${parameter.name}' is not present in the indexed path template.`
          );

          identity = `path-unmatched\u0000${parameter.name}`;
        } else {
          identity = `path-position\u0000${position}`;
        }
      } else {
        const name = parameter.in === "header"
          ? parameter.name.toLowerCase()
          : parameter.name;

        identity = `${parameter.in}\u0000${name}`;
      }

      if (result.has(identity)) {
        addWarning(
          operation.metadata.sourcePointer,
          `More than one effective parameter maps to '${identity}'. The parameter comparison may be incomplete.`
        );

        identity = `${identity}\u0000${parameter.name}`;
      }

      result.set(identity, parameter);
    }

    return result;
  };

  const compareParameters = (
    oldMetadata,
    newMetadata,
    context
  ) => {
    const oldParameters = getEffectiveParameters({
      side: "baseline",
      metadata: oldMetadata,
    });

    const newParameters = getEffectiveParameters({
      side: "candidate",
      metadata: newMetadata,
    });

    const locationChangedOldIdentities = new Set();
    const locationChangedNewIdentities = new Set();

    // A same-name parameter moved to another location is one explicit
    // breaking change (PAR-012), not an unrelated removal plus addition.
    for (const [oldIdentity, oldParameter] of oldParameters) {
      if (newParameters.has(oldIdentity)) continue;

      const possibleMatches = [...newParameters.entries()].filter(
        ([newIdentity, candidate]) => {
          if (oldParameters.has(newIdentity)) return false;
          if (candidate.in === oldParameter.in) return false;

          const headerNameComparison =
            oldParameter.in === "header" || candidate.in === "header";

          const oldName = headerNameComparison
            ? oldParameter.name.toLowerCase()
            : oldParameter.name;

          const candidateName = headerNameComparison
            ? candidate.name.toLowerCase()
            : candidate.name;

          return candidateName === oldName;
        }
      );

      if (possibleMatches.length !== 1) continue;

      const [newIdentity, newParameter] = possibleMatches[0];

      if (locationChangedNewIdentities.has(newIdentity)) continue;

      locationChangedOldIdentities.add(oldIdentity);
      locationChangedNewIdentities.add(newIdentity);

      addChange({
        ...context,
        category: "parameter",
        changeType: "PARAMETER_LOCATION_CHANGED",
        ruleId: "PAR-012",
        classification: "BREAKING",
        severity: "BREAKING",
        field: `parameters.${oldParameter.name}.in`,
        message: `Parameter ${oldParameter.name} moved from ${oldParameter.in} to ${newParameter.in}.`,
        oldValue: oldParameter.in,
        newValue: newParameter.in,
      });
    }

    for (const [identity, oldParameter] of oldParameters) {
      if (locationChangedOldIdentities.has(identity)) continue;

      const field =
        `parameters.${oldParameter.in}.${oldParameter.name}`;

      if (!newParameters.has(identity)) {
        addChange({
          ...context,
          category: "parameter",
          changeType: "PARAMETER_REMOVED",
          severity: "BREAKING",
          field,
          message: `The candidate removes the ${oldParameter.in} parameter ${oldParameter.name}.`,
          oldValue: oldParameter,
        });

        continue;
      }

      const newParameter = newParameters.get(identity);

      const documentationKeys = ["description", "example", "examples"];
      const oldDocumentation = Object.fromEntries(
        documentationKeys
          .filter((key) => Object.hasOwn(oldParameter, key))
          .map((key) => [key, oldParameter[key]])
      );
      const newDocumentation = Object.fromEntries(
        documentationKeys
          .filter((key) => Object.hasOwn(newParameter, key))
          .map((key) => [key, newParameter[key]])
      );

      if (
        stableSerialize(oldDocumentation) !==
        stableSerialize(newDocumentation)
      ) {
        addChange({
          ...context,
          category: "parameter",
          changeType: "PARAMETER_DOCUMENTATION_CHANGED",
          severity: "INFO",
          field: `${field}.documentation`,
          message: `The description or examples for parameter ${oldParameter.name} changed.`,
          oldValue: oldDocumentation,
          newValue: newDocumentation,
        });
      }

      if (
        oldParameter.required !== true &&
        newParameter.required === true
      ) {
        addChange({
          ...context,
          category: "parameter",
          changeType: "PARAMETER_REQUIRED",
          severity: "BREAKING",
          field: `${field}.required`,
          message: `The candidate makes parameter ${oldParameter.name} required.`,
          oldValue: false,
          newValue: true,
        });
      } else if (
        oldParameter.required === true &&
        newParameter.required !== true
      ) {
        addChange({
          ...context,
          category: "parameter",
          changeType: "PARAMETER_OPTIONAL",
          severity: "NON_BREAKING",
          field: `${field}.required`,
          message: `The candidate makes parameter ${oldParameter.name} optional.`,
          oldValue: true,
          newValue: false,
        });
      }

      for (const keyword of [
        "style",
        "explode",
        "allowReserved",
        "allowEmptyValue",
      ]) {
        if (oldParameter[keyword] !== newParameter[keyword]) {
          addChange({
            ...context,
            category: "parameter",
            changeType: "PARAMETER_SERIALIZATION_CHANGED",
            severity: "BREAKING",
            field: `${field}.${keyword}`,
            message: `The ${keyword} setting of parameter ${oldParameter.name} changed.`,
            oldValue: oldParameter[keyword],
            newValue: newParameter[keyword],
          });
        }
      }

      const oldHasSchema =
        isRecord(oldParameter.schema) ||
        typeof oldParameter.schema === "boolean";

      const newHasSchema =
        isRecord(newParameter.schema) ||
        typeof newParameter.schema === "boolean";

      if (oldHasSchema && newHasSchema) {
        compareSchema(
          oldParameter.schema,
          newParameter.schema,
          {
            ...context,
            category: "parameter",
            field: `${field}.schema`,
          },
          "request"
        );
      } else if (oldHasSchema && !newHasSchema) {
        addChange({
          ...context,
          category: "parameter",
          changeType: "PARAMETER_SCHEMA_REMOVED",
          severity: "NON_BREAKING",
          field: `${field}.schema`,
          message: "The candidate removes the parameter schema; request validation semantics require review.",
          oldValue: oldParameter.schema,
        });

        addWarning(
          `${field}.schema`,
          "Parameter schema removal is not automatically classified as safe."
        );
      } else if (!oldHasSchema && newHasSchema) {
        addChange({
          ...context,
          category: "parameter",
          changeType: "PARAMETER_SCHEMA_ADDED",
          severity: "BREAKING",
          field: `${field}.schema`,
          message: "The candidate adds a parameter schema constraint.",
          newValue: newParameter.schema,
        });
      }

      compareContent(
        oldParameter.content,
        newParameter.content,
        {
          ...context,
          category: "parameter",
          field: `${field}.content`,
        },
        "request"
      );
    }

    for (const [identity, parameter] of newParameters) {
      if (
        oldParameters.has(identity) ||
        locationChangedNewIdentities.has(identity)
      ) continue;

      const required = parameter.required === true;

      addChange({
        ...context,
        category: "parameter",
        changeType: "PARAMETER_ADDED",
        severity: required ? "BREAKING" : "NON_BREAKING",
        field: `parameters.${parameter.in}.${parameter.name}`,
        message: required
          ? `The candidate adds required parameter ${parameter.name}.`
          : `The candidate adds optional parameter ${parameter.name}.`,
        newValue: parameter,
      });
    }
  };

  const compareRequestBodies = (
    oldOperation,
    newOperation,
    context
  ) => {
    const oldRaw = oldOperation.requestBody;
    const newRaw = newOperation.requestBody;

    if (oldRaw === undefined && newRaw === undefined) return;

    if (oldRaw === undefined || newRaw === undefined) {
      const candidateBody = newRaw === undefined
        ? null
        : resolveObject(
            newRaw,
            candidateRefs,
            candidateDocument,
            `${context.field}.requestBody`
          );

      const required = candidateBody?.required === true;
      const breaking = oldRaw === undefined ? required : true;

      addChange({
        ...context,
        category: "requestBody",
        changeType: oldRaw === undefined
          ? "REQUEST_BODY_ADDED"
          : "REQUEST_BODY_REMOVED",
        severity: breaking ? "BREAKING" : "NON_BREAKING",
        field: "requestBody",
        message: oldRaw === undefined
          ? required
            ? "The candidate adds a required request body."
            : "The candidate adds an optional request body."
          : "The candidate removes the request body.",
        oldValue: oldRaw ?? null,
        newValue: candidateBody,
      });

      return;
    }

    const oldBody = resolveObject(
      oldRaw,
      baselineRefs,
      baselineDocument,
      `${context.field}.requestBody`
    );

    const newBody = resolveObject(
      newRaw,
      candidateRefs,
      candidateDocument,
      `${context.field}.requestBody`
    );

    if (!isRecord(oldBody) || !isRecord(newBody)) return;

    if (oldBody.required !== true && newBody.required === true) {
      addChange({
        ...context,
        category: "requestBody",
        changeType: "REQUEST_BODY_REQUIRED",
        severity: "BREAKING",
        field: "requestBody.required",
        message: "The candidate makes the request body required.",
        oldValue: false,
        newValue: true,
      });
    } else if (
      oldBody.required === true &&
      newBody.required !== true
    ) {
      addChange({
        ...context,
        category: "requestBody",
        changeType: "REQUEST_BODY_OPTIONAL",
        severity: "NON_BREAKING",
        field: "requestBody.required",
        message: "The candidate makes the request body optional.",
        oldValue: true,
        newValue: false,
      });
    }

    compareContent(
      oldBody.content,
      newBody.content,
      {
        ...context,
        category: "requestBody",
        field: "requestBody.content",
      },
      "request"
    );
  };

  const compareResponses = (
    oldOperation,
    newOperation,
    context
  ) => {
    const oldResponses = isRecord(oldOperation.responses)
      ? oldOperation.responses
      : {};

    const newResponses = isRecord(newOperation.responses)
      ? newOperation.responses
      : {};

    for (const [status, oldRaw] of Object.entries(oldResponses)) {
      if (!Object.hasOwn(newResponses, status)) {
        const covered = statusCoveredBy(status, newResponses);

        addChange({
          ...context,
          category: "response",
          changeType: covered
            ? "RESPONSE_STATUS_COVERAGE_CHANGED"
            : "RESPONSE_REMOVED",
          severity: covered ? "INFO" : "BREAKING",
          field: `responses.${status}`,
          message: covered
            ? `The explicit ${status} response is now covered by a broader response; verify response schema and semantics.`
            : `The candidate removes response ${status}.`,
          oldValue: status,
        });

        if (covered) {
          addWarning(
            `responses.${status}`,
            "A broader response may cover this status, but equivalent response content cannot be established automatically."
          );
        }

        continue;
      }

      const oldResponse = resolveObject(
        oldRaw,
        baselineRefs,
        baselineDocument,
        `responses.${status}`
      );

      const newResponse = resolveObject(
        newResponses[status],
        candidateRefs,
        candidateDocument,
        `responses.${status}`
      );

      if (!isRecord(oldResponse) || !isRecord(newResponse)) continue;

      if ((oldResponse.description ?? "") !== (newResponse.description ?? "")) {
        addChange({
          ...context,
          category: "response",
          changeType: "RESPONSE_DOCUMENTATION_CHANGED",
          severity: "INFO",
          field: `responses.${status}.description`,
          message: `The description for response ${status} changed.`,
          oldValue: oldResponse.description ?? null,
          newValue: newResponse.description ?? null,
        });
      }

      compareContent(
        oldResponse.content,
        newResponse.content,
        {
          ...context,
          category: "response",
          field: `responses.${status}.content`,
        },
        "response"
      );

      const oldHeaders = isRecord(oldResponse.headers)
        ? oldResponse.headers
        : {};

      const newHeaders = isRecord(newResponse.headers)
        ? newResponse.headers
        : {};

      const oldMap = new Map(
        Object.entries(oldHeaders).map(
          ([name, value]) => [
            name.toLowerCase(),
            { name, value },
          ]
        )
      );

      const newMap = new Map(
        Object.entries(newHeaders).map(
          ([name, value]) => [
            name.toLowerCase(),
            { name, value },
          ]
        )
      );

      for (const [normalizedName, oldEntry] of oldMap) {
        if (newMap.has(normalizedName)) continue;

        addChange({
          ...context,
          category: "response",
          changeType: "RESPONSE_HEADER_REMOVED",
          severity: "BREAKING",
          field: `responses.${status}.headers.${oldEntry.name}`,
          message: `The candidate removes response header ${oldEntry.name}.`,
          oldValue: oldEntry.name,
        });
      }

      for (const [normalizedName, newEntry] of newMap) {
        if (!oldMap.has(normalizedName)) {
          addChange({
            ...context,
            category: "response",
            changeType: "RESPONSE_HEADER_ADDED",
            severity: "NON_BREAKING",
            field: `responses.${status}.headers.${newEntry.name}`,
            message: `The candidate adds response header ${newEntry.name}.`,
            newValue: newEntry.name,
          });

          continue;
        }

        const oldHeaderEntry = oldMap.get(normalizedName);

        const oldHeader = resolveObject(
          oldHeaderEntry.value,
          baselineRefs,
          baselineDocument,
          `responses.${status}.headers.${oldHeaderEntry.name}`
        );

        const newHeader = resolveObject(
          newEntry.value,
          candidateRefs,
          candidateDocument,
          `responses.${status}.headers.${newEntry.name}`
        );

        if (!isRecord(oldHeader) || !isRecord(newHeader)) continue;

        const oldHasSchema =
          isRecord(oldHeader.schema) ||
          typeof oldHeader.schema === "boolean";

        const newHasSchema =
          isRecord(newHeader.schema) ||
          typeof newHeader.schema === "boolean";

        const headerSchemaField =
          `responses.${status}.headers.${newEntry.name}.schema`;

        if (oldHasSchema !== newHasSchema) {
          const schemaAdded = newHasSchema;

          addChange({
            ...context,
            category: "response",
            changeType: schemaAdded
              ? "RESPONSE_HEADER_SCHEMA_ADDED"
              : "RESPONSE_HEADER_SCHEMA_REMOVED",
            severity: schemaAdded ? "NON_BREAKING" : "BREAKING",
            field: headerSchemaField,
            message: schemaAdded
              ? "The candidate adds a response header schema."
              : "The candidate removes a response header schema.",
            oldValue: oldHasSchema ? oldHeader.schema : null,
            newValue: newHasSchema ? newHeader.schema : null,
          });
        } else if (oldHasSchema && newHasSchema) {
          compareSchema(
            oldHeader.schema,
            newHeader.schema,
            {
              ...context,
              category: "response",
              field: headerSchemaField,
            },
            "response"
          );
        }

        compareContent(
          oldHeader.content,
          newHeader.content,
          {
            ...context,
            category: "response",
            field: `responses.${status}.headers.${newEntry.name}.content`,
          },
          "response"
        );
      }
    }

    for (const status of Object.keys(newResponses)) {
      if (Object.hasOwn(oldResponses, status)) continue;

      addChange({
        ...context,
        category: "response",
        changeType: "RESPONSE_ADDED",
        severity: "NON_BREAKING",
        field: `responses.${status}`,
        message: `The candidate adds response ${status}.`,
        newValue: status,
      });
    }
  };

  const compareOperation = (
    oldMetadata,
    newMetadata,
    matchType = "CANONICAL_IDENTITY"
  ) => {
    void matchType;

    const changesBefore = changes.length;
    const warningsBefore = warnings.length;

    const oldOperation = pointerValue(
      baselineRefs,
      oldMetadata.sourcePointer
    );

    const newOperation = pointerValue(
      candidateRefs,
      newMetadata.sourcePointer
    );

    const oldPathItem = pointerValue(
      baselineRefs,
      oldMetadata.pathItemPointer
    );

    const newPathItem = pointerValue(
      candidateRefs,
      newMetadata.pathItemPointer
    );

    if (
      ![oldOperation, newOperation, oldPathItem, newPathItem].every(isRecord)
    ) {
      addWarning(
        oldMetadata.sourcePointer,
        "The matched operation could not be loaded completely."
      );

      return;
    }

    const context = {
      path: oldMetadata.path,
      method: oldMetadata.method,
      operationKey: oldMetadata.operationKey,
      baselinePointer: oldMetadata.sourcePointer,
      candidatePointer: newMetadata.sourcePointer,
    };

    if (oldOperation.operationId !== newOperation.operationId) {
      addChange({
        ...context,
        category: "metadata",
        changeType: "OPERATION_ID_CHANGED",
        severity: "BREAKING",
        field: "operationId",
        message: "The operationId changed and may affect generated client method names.",
        oldValue: oldOperation.operationId ?? null,
        newValue: newOperation.operationId ?? null,
      });
    }

    if (
      oldOperation.deprecated !== true &&
      newOperation.deprecated === true
    ) {
      addChange({
        ...context,
        category: "metadata",
        changeType: "OPERATION_DEPRECATED",
        severity: "INFO",
        field: "deprecated",
        message: "The candidate marks this operation as deprecated.",
        oldValue: false,
        newValue: true,
      });
    }

    if (
      oldOperation.summary !== newOperation.summary ||
      oldOperation.description !== newOperation.description ||
      stableSerialize(oldOperation.tags ?? []) !==
        stableSerialize(newOperation.tags ?? [])
    ) {
      addChange({
        ...context,
        category: "metadata",
        changeType: "OPERATION_DOCUMENTATION_CHANGED",
        ruleId: "OP-006",
        classification: "INFORMATIONAL",
        severity: "INFO",
        field: "documentation",
        message: "The operation summary, description, or tags changed.",
        oldValue: {
          summary: oldOperation.summary ?? null,
          description: oldOperation.description ?? null,
          tags: oldOperation.tags ?? [],
        },
        newValue: {
          summary: newOperation.summary ?? null,
          description: newOperation.description ?? null,
          tags: newOperation.tags ?? [],
        },
      });
    }

    // Match path parameters by position after canonical path matching.
    // The original parameter names remain available for the OP-004 finding.
    if (
      oldMetadata.kind === "path" &&
      newMetadata.kind === "path" &&
      oldMetadata.canonicalPath === newMetadata.canonicalPath
    ) {
      const oldPathParameterNames =
        oldMetadata.pathParameterNames ?? [];

      const newPathParameterNames =
        newMetadata.pathParameterNames ?? [];

      const parameterCount = Math.min(
        oldPathParameterNames.length,
        newPathParameterNames.length
      );

      for (let index = 0; index < parameterCount; index += 1) {
        const oldName = oldPathParameterNames[index];
        const newName = newPathParameterNames[index];

        if (oldName === newName) continue;

        addChange({
          ...context,
          category: "operation",
          changeType: "PATH_PARAMETER_RENAMED",
          ruleId: "OP-004",
          classification: "POTENTIALLY_BREAKING",
          severity: "INFO",
          field: `pathParameters[${index}].name`,
          message: `Path parameter '${oldName}' was renamed to '${newName}'. The route shape is unchanged, but generated clients and parameter bindings may be affected.`,
          oldValue: oldName,
          newValue: newName,
        });
      }
    }

    // A unique operationId can identify an operation whose static path changed.
    if (
      oldMetadata.kind === "path" &&
      newMetadata.kind === "path" &&
      oldMetadata.canonicalPath !== newMetadata.canonicalPath
    ) {
      addChange({
        ...context,
        category: "operation",
        changeType: "OPERATION_PATH_CHANGED",
        ruleId: "OP-003",
        classification: "BREAKING",
        severity: "BREAKING",
        field: "path",
        message: `The operation path changed from '${oldMetadata.path}' to '${newMetadata.path}'.`,
        oldValue: oldMetadata.path,
        newValue: newMetadata.path,
      });
    }

    if (
      oldMetadata.kind === "path" &&
      newMetadata.kind === "path" &&
      oldMetadata.method !== newMetadata.method
    ) {
      addChange({
        ...context,
        category: "operation",
        changeType: "OPERATION_METHOD_CHANGED",
        ruleId: "OP-008",
        classification: "BREAKING",
        severity: "BREAKING",
        field: "method",
        message: `The operation method changed from '${oldMetadata.method}' to '${newMetadata.method}'.`,
        oldValue: oldMetadata.method,
        newValue: newMetadata.method,
      });
    }

    compareParameters(oldMetadata, newMetadata, context);
    compareRequestBodies(oldOperation, newOperation, context);
    compareResponses(oldOperation, newOperation, context);

    const oldSecurity = Object.hasOwn(oldOperation, "security")
      ? oldOperation.security
      : baselineDocument.security ?? [];

    const newSecurity = Object.hasOwn(newOperation, "security")
      ? newOperation.security
      : candidateDocument.security ?? [];

    if (stableSerialize(oldSecurity) !== stableSerialize(newSecurity)) {
      addChange({
        ...context,
        category: "security",
        changeType: "SECURITY_REQUIREMENTS_CHANGED",
        severity: "INFO",
        field: "security",
        message: "Security requirements changed; the authorization impact requires manual review.",
        oldValue: oldSecurity,
        newValue: newSecurity,
      });

      addWarning(
        `${context.method} ${context.path}.security`,
        "The security requirement change could not be classified automatically."
      );
    }

    const effectiveServers = (operation, pathItem, document) => {
      if (Array.isArray(operation.servers)) {
        return operation.servers.length
          ? operation.servers
          : [{ url: "/" }];
      }

      if (Array.isArray(pathItem.servers)) {
        return pathItem.servers.length
          ? pathItem.servers
          : [{ url: "/" }];
      }

      return Array.isArray(document.servers) && document.servers.length
        ? document.servers
        : [{ url: "/" }];
    };

    const oldServers = effectiveServers(
      oldOperation,
      oldPathItem,
      baselineDocument
    );

    const newServers = effectiveServers(
      newOperation,
      newPathItem,
      candidateDocument
    );

    if (stableSerialize(oldServers) !== stableSerialize(newServers)) {
      addChange({
        ...context,
        category: "server",
        changeType: "SERVER_CONFIGURATION_CHANGED",
        severity: "INFO",
        field: "servers",
        message: "The effective server configuration changed and requires endpoint/environment review.",
        oldValue: oldServers,
        newValue: newServers,
      });

      addWarning(
        `${context.method} ${context.path}.servers`,
        "Server URL changes are not automatically classified as breaking because deployment and routing context is unknown."
      );
    }

    if (
      changes.length === changesBefore &&
      warnings.length === warningsBefore
    ) {
      unchangedOperations += 1;
    }
  };

  const baselineOperations = createOperationIndex(baselineDocument);
  const candidateOperations = createOperationIndex(candidateDocument);

  const reportIndexIssues = (operations, side) => {
    for (const operation of operations) {
      for (const issue of operation.pathTemplateIssues ?? []) {
        addWarning(
          `${side}.${operation.sourcePointer}`,
          issue.message
        );
      }
    }
  };

  reportIndexIssues(baselineOperations, "baseline");
  reportIndexIssues(candidateOperations, "candidate");

  const operationMatching = matchOpenApiOperations(
    baselineOperations,
    candidateOperations
  );

  for (const diagnostic of operationMatching.diagnostics) {
    addWarning(
      `${diagnostic.field || "operations"}.${diagnostic.code.toLowerCase()}`,
      diagnostic.message
    );
  }

  for (const match of operationMatching.matches) {
    compareOperation(
      match.baseline,
      match.candidate,
      match.matchType
    );
  }

  for (const oldOperation of operationMatching.unmatchedBaseline) {
    removedOperations += 1;

    addChange({
      category: "operation",
      changeType: "OPERATION_REMOVED",
      ruleId: "OP-001",
      classification: "BREAKING",
      severity: "BREAKING",
      path: oldOperation.path,
      method: oldOperation.method,
      operationKey: oldOperation.operationKey,
      field: "operation",
      message: `The candidate removes ${oldOperation.method} ${oldOperation.path}.`,
      oldValue: {
        method: oldOperation.method,
        path: oldOperation.path,
        operationId: oldOperation.operationId,
      },
      baselinePointer: oldOperation.sourcePointer,
    });
  }

  for (const newOperation of operationMatching.unmatchedCandidate) {
    addedOperations += 1;

    addChange({
      category: "operation",
      changeType: "OPERATION_ADDED",
      ruleId: "OP-002",
      classification: "NON_BREAKING",
      severity: "NON_BREAKING",
      path: newOperation.path,
      method: newOperation.method,
      operationKey: newOperation.operationKey,
      field: "operation",
      message: `The candidate adds ${newOperation.method} ${newOperation.path}.`,
      newValue: {
        method: newOperation.method,
        path: newOperation.path,
        operationId: newOperation.operationId,
      },
      candidatePointer: newOperation.sourcePointer,
    });
  }

  const oldSecuritySchemes = isRecord(
    baselineDocument.components?.securitySchemes
  )
    ? baselineDocument.components.securitySchemes
    : {};

  const newSecuritySchemes = isRecord(
    candidateDocument.components?.securitySchemes
  )
    ? candidateDocument.components.securitySchemes
    : {};

  for (const name of new Set([
    ...Object.keys(oldSecuritySchemes),
    ...Object.keys(newSecuritySchemes),
  ])) {
    if (
      stableSerialize(oldSecuritySchemes[name]) ===
      stableSerialize(newSecuritySchemes[name])
    ) {
      continue;
    }

    const changeType =
      Object.hasOwn(oldSecuritySchemes, name) &&
      !Object.hasOwn(newSecuritySchemes, name)
        ? "SECURITY_SCHEME_REMOVED"
        : !Object.hasOwn(oldSecuritySchemes, name)
          ? "SECURITY_SCHEME_ADDED"
          : "SECURITY_SCHEME_CHANGED";

    addChange({
      category: "security",
      changeType,
      severity: "INFO",
      field: `components.securitySchemes.${name}`,
      message: `The ${name} security scheme definition changed; authentication compatibility requires manual review.`,
      oldValue: oldSecuritySchemes[name] ?? null,
      newValue: newSecuritySchemes[name] ?? null,
    });

    addWarning(
      `components.securitySchemes.${name}`,
      "Security scheme changes require review of type, credentials, location, OAuth flows and scopes."
    );
  }

  if (baselineDocument.openapi !== candidateDocument.openapi) {
    addWarning(
      "openapi",
      "The OpenAPI specification version changed; version-specific behavior may differ."
    );
  }

  // Warnings identify portions of the contract whose behavior could not
  // be fully analyzed. Preserve the warning for diagnostics and also expose
  // a first-class UNSUPPORTED finding so reports cannot look fully compatible.
  const unsupportedWarningKeys = new Set();

  for (const warning of warnings) {
    if (changes.length >= MAX_CHANGES) break;

    const key = `${warning.field}\u0000${warning.message}`;
    if (unsupportedWarningKeys.has(key)) continue;
    unsupportedWarningKeys.add(key);

    const metadata = warningMetadata.get(key) ?? {};
    const isRequestEncodingWarning =
      warning.field.startsWith("requestBody.content.") &&
      /encoding changes require manual serialization compatibility review/iu.test(
        warning.message
      );

    addChange({
      ...metadata,
      category: isRequestEncodingWarning ? "requestBody" : "metadata",
      changeType: isRequestEncodingWarning
        ? "REQUEST_ENCODING_CHANGED"
        : "ANALYSIS_UNSUPPORTED_CONSTRUCT",
      ruleId: isRequestEncodingWarning ? "REQ-012" : "SCH-001",
      classification: isRequestEncodingWarning
        ? "POTENTIALLY_BREAKING"
        : "UNSUPPORTED",
      severity: "INFO",
      field: warning.field,
      jsonPointer: warning.field.startsWith("#/")
        ? warning.field
        : null,
      affectedOperationKeys: metadata.operationKey
        ? [metadata.operationKey]
        : [],
      message: warning.message,
      summary: `Compatibility analysis could not fully evaluate: ${warning.field}`,
      rationale: "The v1 ruleset requires uncertain or unsupported constructs to remain visible and prevent a COMPLETE compatibility result.",
    });
  }

  if (omittedWarnings > 0) {
    const summaryWarning = {
      field: "analysis.warnings",
      message: `${omittedWarnings} additional warnings were omitted because the analyzer retains at most ${MAX_WARNINGS}.`,
    };

    if (warnings.length >= MAX_WARNINGS) {
      warnings[MAX_WARNINGS - 1] = summaryWarning;
    } else {
      warnings.push(summaryWarning);
    }
  }

  const classificationSummary = createClassificationSummary(changes);
  const breakingChanges = classificationSummary.breaking;
  const nonBreakingChanges = classificationSummary.nonBreaking;
  const informationalChanges = classificationSummary.informational;

  return {
    direction: COMPATIBILITY_DIRECTION,
    rulesetVersion: COMPATIBILITY_RULESET_VERSION,

    analysisStatus:
      warnings.length > 0 || classificationSummary.unsupported > 0
        ? "PARTIAL"
        : "COMPLETE",

    summary: {
      ...classificationSummary,
      totalChanges: changes.length,
      breakingChanges,
      nonBreakingChanges,
      informationalChanges,
      addedOperations,
      removedOperations,
      unchangedOperations,
    },

    changes,
    warnings,
  };
};

export default compareCompatibility;