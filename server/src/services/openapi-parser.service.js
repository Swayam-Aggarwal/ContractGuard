
import { validate } from "@scalar/openapi-parser";
import { parseAllDocuments } from "yaml";

import AppError from "../utils/appError.js";

import createOperationIndex from
  "./openapi-operation-index.service.js";

import { STANDARD_HTTP_METHODS } from "../constants/openapi.js";

export const MAX_SPEC_BYTES = 1024 * 1024;
export const MAX_PATH_ENTRIES = 250;
export const MAX_OPERATIONS = 500;
export const MAX_REFERENCE_DEPTH = 20;
export const MAX_DOCUMENT_NESTING_DEPTH = 80;
export const MAX_REFERENCES = 5000;

const isRecord = (value) => {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
};

const createSpecError = (
  message,
  {
    statusCode = 422,
    code = "SPEC_INVALID",
    details = [],
  } = {}
) => {
  return new AppError(message, {
    statusCode,
    code,
    details,
  });
};

const encodePointer = (segments) => {
  if (segments.length === 0) return "#";

  return `#/${segments
    .map((segment) =>
      String(segment)
        .replace(/~/g, "~0")
        .replace(/\//g, "~1")
    )
    .join("/")}`;
};

const parseLocalJsonPointer = (reference, sourcePointer) => {
  if (!reference.startsWith("#")) {
    throw createSpecError(
      "External specification references are not supported.",
      {
        details: [{
          field: sourcePointer,
          message:
            "Use an internal JSON Pointer reference beginning with #.",
        }],
      }
    );
  }

  let fragment;

  try {
    fragment = decodeURIComponent(reference.slice(1));
  } catch {
    throw createSpecError(
      "The specification contains an invalid reference.",
      {
        details: [{
          field: sourcePointer,
          message: "The reference contains invalid URI encoding.",
        }],
      }
    );
  }

  if (fragment === "") return [];

  if (!fragment.startsWith("/")) {
    throw createSpecError(
      "Only internal JSON Pointer references are supported.",
      {
        details: [{
          field: sourcePointer,
          message: "The reference must use # or a #/ JSON Pointer.",
        }],
      }
    );
  }

  return fragment
    .slice(1)
    .split("/")
    .map((segment) => {
      if (/~(?![01])/u.test(segment)) {
        throw createSpecError(
          "The specification contains an invalid JSON Pointer.",
          {
            details: [{
              field: sourcePointer,
              message:
                "JSON Pointer segments may only use ~0 and ~1 escapes.",
            }],
          }
        );
      }

      return segment
        .replace(/~1/g, "/")
        .replace(/~0/g, "~");
    });
};

const getPointerValue = (root, segments) => {
  let current = root;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/u.test(segment)) {
        return { found: false };
      }

      const index = Number(segment);

      if (index >= current.length) {
        return { found: false };
      }

      current = current[index];
      continue;
    }

    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { found: false };
    }

    current = current[segment];
  }

  return {
    found: true,
    value: current,
  };
};

const formatYamlDiagnostics = (issues) => {
  return issues.slice(0, 30).map((issue) => {
    const position = Array.isArray(issue.linePos)
      ? issue.linePos[0]
      : null;

    const field = position
      ? `line ${position.line}, column ${position.col}`
      : "document";

    return {
      field,
      message:
        typeof issue.message === "string"
          ? issue.message
          : "The YAML document contains an invalid construct.",
    };
  });
};

const parseJson = (sourceText) => {
  try {
    return {
      document: JSON.parse(sourceText),
      warnings: [],
    };
  } catch {
    throw createSpecError(
      "The uploaded file does not contain valid JSON.",
      {
        statusCode: 400,
        details: [{
          field: "document",
          message: "Check the JSON syntax and try again.",
        }],
      }
    );
  }
};

const parseYaml = (sourceText) => {
  let yamlDocuments;

  try {
    yamlDocuments = parseAllDocuments(sourceText, {
      version: "1.2",
      schema: "core",
      strict: true,
      uniqueKeys: true,
      merge: false,
      logLevel: "error",
    });
  } catch {
    throw createSpecError(
      "The uploaded file does not contain valid YAML.",
      {
        statusCode: 400,
        details: [{
          field: "document",
          message: "Check the YAML syntax and try again.",
        }],
      }
    );
  }

  if (yamlDocuments.length !== 1) {
    throw createSpecError(
      "The uploaded YAML file must contain exactly one document.",
      {
        statusCode: 400,
        details: [{
          field: "document",
          message: "Multiple YAML documents are not supported.",
        }],
      }
    );
  }

  const yamlDocument = yamlDocuments[0];

  if (yamlDocument.errors.length > 0) {
    throw createSpecError(
      "The uploaded YAML document is invalid.",
      {
        statusCode: 400,
        details: formatYamlDiagnostics(yamlDocument.errors),
      }
    );
  }

  let document;

  try {
    document = yamlDocument.toJS({
      maxAliasCount: 0,
    });
  } catch {
    throw createSpecError(
      "The YAML document uses an unsupported alias or anchor.",
      {
        statusCode: 400,
        details: [{
          field: "document",
          message:
            "Remove YAML aliases and anchors. OpenAPI $ref references are handled separately.",
        }],
      }
    );
  }

  return {
    document,
    warnings: formatYamlDiagnostics(yamlDocument.warnings),
  };
};

const assertSupportedVersion = (document) => {
  if (document.swagger === "2.0") {
    throw createSpecError(
      "Swagger 2.0 documents are not supported.",
      {
        code: "SPEC_VERSION_UNSUPPORTED",
        details: [{
          field: "swagger",
          message:
            "Convert the document to OpenAPI 3.0, 3.1 or 3.2 before uploading.",
        }],
      }
    );
  }

  if (typeof document.openapi !== "string") {
    throw createSpecError(
      "The document does not declare a valid OpenAPI version.",
      {
        details: [{
          field: "openapi",
          message:
            "An OpenAPI version such as 3.0.3, 3.1.0 or 3.2.0 is required.",
        }],
      }
    );
  }

  if (!/^3\.(?:0|1|2)\.\d+$/u.test(document.openapi)) {
    throw createSpecError(
      `OpenAPI version ${document.openapi} is not supported.`,
      {
        code: "SPEC_VERSION_UNSUPPORTED",
        details: [{
          field: "openapi",
          message:
            "Supported versions are OpenAPI 3.0.x, 3.1.x and 3.2.x.",
        }],
      }
    );
  }

  if (
    !isRecord(document.info) ||
    typeof document.info.title !== "string" ||
    document.info.title.trim().length === 0 ||
    typeof document.info.version !== "string" ||
    document.info.version.trim().length === 0
  ) {
    throw createSpecError(
      "The OpenAPI document has invalid information metadata.",
      {
        details: [{
          field: "info",
          message:
            "The info object must contain non-empty title and version strings.",
        }],
      }
    );
  }
};

const inspectReferenceDepth = (references) => {
  const referencesBySourcePrefix = new Map();

  for (const reference of references) {
    for (
      let length = 0;
      length <= reference.sourcePath.length;
      length += 1
    ) {
      const prefix = encodePointer(
        reference.sourcePath.slice(0, length)
      );

      const existing =
        referencesBySourcePrefix.get(prefix) ?? [];

      existing.push(reference);
      referencesBySourcePrefix.set(prefix, existing);
    }
  }

  const adjacency = new Map();

  for (const reference of references) {
    adjacency.set(
      reference.targetPointer,
      referencesBySourcePrefix.get(reference.targetPointer) ?? []
    );
  }

  const activeReferences = new Set();
  const maximumDepthVisited = new Map();
  let circularReferencesFound = false;

  const visit = (targetPointer, depth) => {
    if (activeReferences.has(targetPointer)) {
      circularReferencesFound = true;
      return;
    }

    if (depth > MAX_REFERENCE_DEPTH) {
      throw createSpecError(
        `The document exceeds the maximum internal reference depth of ${MAX_REFERENCE_DEPTH}.`,
        {
          code: "SPEC_LIMIT_EXCEEDED",
          details: [{
            field: targetPointer,
            message: "Reduce the length of the internal $ref chain.",
          }],
        }
      );
    }

    const previousDepth =
      maximumDepthVisited.get(targetPointer) ?? 0;

    if (previousDepth >= depth) return;

    maximumDepthVisited.set(targetPointer, depth);
    activeReferences.add(targetPointer);

    for (const nestedReference of adjacency.get(targetPointer) ?? []) {
      visit(nestedReference.targetPointer, depth + 1);
    }

    activeReferences.delete(targetPointer);
  };

  for (const reference of references) {
    visit(reference.targetPointer, 1);
  }

  return circularReferencesFound
    ? [{
        field: "document",
        message:
          "Circular internal references were detected. They are preserved without dereferencing.",
      }]
    : [];
};

/*
 * Reference discovery is context-aware.
 *
 * `$ref` is interpreted only where the OpenAPI or JSON Schema
 * specification defines a Reference Object or Schema Object reference.
 *
 * Arbitrary example values, defaults, enum values, const values and
 * extension values are deliberately not inspected for references.
 */
const inspectDocument = (document) => {
  const references = [];
  const supportsSchemaRefSiblings =
    /^3\.(?:1|2)\./u.test(document.openapi || "");

  const inspectReference = (value, path) => {
    const reference = value.$ref;
    const sourcePointer = encodePointer(path);

    if (
      typeof reference !== "string" ||
      reference.trim().length === 0
    ) {
      throw createSpecError(
        "The specification contains an invalid $ref value.",
        {
          details: [{
            field: sourcePointer,
            message: "$ref must be a non-empty string.",
          }],
        }
      );
    }

    const targetSegments = parseLocalJsonPointer(
      reference,
      sourcePointer
    );

    const target = getPointerValue(
      document,
      targetSegments
    );

    if (!target.found) {
      throw createSpecError(
        "The specification contains an unresolved internal reference.",
        {
          details: [{
            field: sourcePointer,
            message: `Reference target ${reference} was not found in this document.`,
          }],
        }
      );
    }

    references.push({
      sourcePath: path,
      targetPointer: encodePointer(targetSegments),
    });

    if (references.length > MAX_REFERENCES) {
      throw createSpecError(
        `The document exceeds the maximum of ${MAX_REFERENCES} references.`,
        {
          code: "SPEC_LIMIT_EXCEEDED",
        }
      );
    }
  };

  const visitReferenceObject = (value, path, visitor) => {
    if (!isRecord(value)) return;

    if (Object.hasOwn(value, "$ref")) {
      inspectReference(value, path);
      return;
    }

    visitor(value, path);
  };

  const visitSchema = (schema, path) => {
    if (!isRecord(schema)) return;

    if (Object.hasOwn(schema, "$ref")) {
      inspectReference(schema, path);

      // In OpenAPI 3.0, Schema Object $ref siblings are ignored.
      // In OpenAPI 3.1 and 3.2, JSON Schema sibling semantics apply.
      if (!supportsSchemaRefSiblings) return;
    }

    const visitSchemaValue = (value, childPath) => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          visitSchema(item, [...childPath, String(index)]);
        });
      } else {
        visitSchema(value, childPath);
      }
    };

    const visitSchemaMap = (value, childPath) => {
      if (!isRecord(value)) return;

      for (const [name, nestedSchema] of Object.entries(value)) {
        visitSchema(nestedSchema, [...childPath, name]);
      }
    };

    for (const keyword of [
      "properties",
      "patternProperties",
      "$defs",
      "definitions",
      "dependentSchemas",
    ]) {
      visitSchemaMap(schema[keyword], [...path, keyword]);
    }

    for (const keyword of [
      "items",
      "additionalItems",
      "additionalProperties",
      "unevaluatedItems",
      "unevaluatedProperties",
      "contains",
      "propertyNames",
      "not",
      "if",
      "then",
      "else",
      "contentSchema",
    ]) {
      visitSchemaValue(schema[keyword], [...path, keyword]);
    }

    for (const keyword of [
      "allOf",
      "anyOf",
      "oneOf",
      "prefixItems",
    ]) {
      if (!Array.isArray(schema[keyword])) continue;

      schema[keyword].forEach((nestedSchema, index) => {
        visitSchema(
          nestedSchema,
          [...path, keyword, String(index)]
        );
      });
    }

    // JSON Schema dependencies may contain either arrays of property names
    // or nested schemas. Only nested schema values are inspected.
    if (isRecord(schema.dependencies)) {
      for (const [name, dependency] of Object.entries(schema.dependencies)) {
        if (isRecord(dependency) || typeof dependency === "boolean") {
          visitSchema(
            dependency,
            [...path, "dependencies", name]
          );
        }
      }
    }
  };

  const visitExample = (example, path) => {
    visitReferenceObject(example, path, () => {
      // Example Object.value is arbitrary payload data.
      // A $ref key inside that payload is not a specification reference.
    });
  };

  const visitExamples = (examples, path) => {
    if (!isRecord(examples)) return;

    for (const [name, example] of Object.entries(examples)) {
      visitExample(example, [...path, name]);
    }
  };

  const visitMediaType = (mediaType, path) => {
    if (!isRecord(mediaType)) return;

    if (Object.hasOwn(mediaType, "schema")) {
      visitSchema(mediaType.schema, [...path, "schema"]);
    }

    visitExamples(mediaType.examples, [...path, "examples"]);

    if (!isRecord(mediaType.encoding)) return;

    for (const [propertyName, encoding] of Object.entries(mediaType.encoding)) {
      if (!isRecord(encoding) || !isRecord(encoding.headers)) continue;

      for (const [headerName, header] of Object.entries(encoding.headers)) {
        visitReferenceObject(
          header,
          [...path, "encoding", propertyName, "headers", headerName],
          visitHeader
        );
      }
    }
  };

  const visitContent = (content, path) => {
    if (!isRecord(content)) return;

    for (const [mediaType, definition] of Object.entries(content)) {
      visitMediaType(definition, [...path, mediaType]);
    }
  };

  const visitParameter = (parameter, path) => {
    visitReferenceObject(parameter, path, (value, valuePath) => {
      if (Object.hasOwn(value, "schema")) {
        visitSchema(value.schema, [...valuePath, "schema"]);
      }

      visitContent(value.content, [...valuePath, "content"]);
      visitExamples(value.examples, [...valuePath, "examples"]);

      // The singular `example` property contains payload data.
    });
  };

  const visitHeader = (header, path) => {
    visitReferenceObject(header, path, (value, valuePath) => {
      if (Object.hasOwn(value, "schema")) {
        visitSchema(value.schema, [...valuePath, "schema"]);
      }

      visitContent(value.content, [...valuePath, "content"]);
      visitExamples(value.examples, [...valuePath, "examples"]);
    });
  };

  const visitRequestBody = (requestBody, path) => {
    visitReferenceObject(requestBody, path, (value, valuePath) => {
      visitContent(value.content, [...valuePath, "content"]);
    });
  };

  const visitResponse = (response, path) => {
    visitReferenceObject(response, path, (value, valuePath) => {
      if (isRecord(value.headers)) {
        for (const [name, header] of Object.entries(value.headers)) {
          visitHeader(header, [...valuePath, "headers", name]);
        }
      }

      visitContent(value.content, [...valuePath, "content"]);

      if (isRecord(value.links)) {
        for (const [name, link] of Object.entries(value.links)) {
          visitReferenceObject(
            link,
            [...valuePath, "links", name],
            () => {}
          );
        }
      }
    });
  };

  const visitOperation = (operation, path) => {
    if (!isRecord(operation)) return;

    if (Array.isArray(operation.parameters)) {
      operation.parameters.forEach((parameter, index) => {
        visitParameter(
          parameter,
          [...path, "parameters", String(index)]
        );
      });
    }

    if (Object.hasOwn(operation, "requestBody")) {
      visitRequestBody(
        operation.requestBody,
        [...path, "requestBody"]
      );
    }

    if (isRecord(operation.responses)) {
      for (const [statusCode, response] of Object.entries(operation.responses)) {
        visitResponse(
          response,
          [...path, "responses", statusCode]
        );
      }
    }

    if (isRecord(operation.callbacks)) {
      for (const [name, callback] of Object.entries(operation.callbacks)) {
        visitCallback(
          callback,
          [...path, "callbacks", name]
        );
      }
    }
  };

  const visitPathItem = (pathItem, path) => {
    if (!isRecord(pathItem)) return;

    // Inspect a Path Item reference and its non-conflicting siblings.
    if (Object.hasOwn(pathItem, "$ref")) {
      inspectReference(pathItem, path);
    }

    if (Array.isArray(pathItem.parameters)) {
      pathItem.parameters.forEach((parameter, index) => {
        visitParameter(
          parameter,
          [...path, "parameters", String(index)]
        );
      });
    }

    for (const method of STANDARD_HTTP_METHODS) {
      if (Object.hasOwn(pathItem, method)) {
        visitOperation(pathItem[method], [...path, method]);
      }
    }

    if (isRecord(pathItem.additionalOperations)) {
      for (const [method, operation] of Object.entries(pathItem.additionalOperations)) {
        visitOperation(
          operation,
          [...path, "additionalOperations", method]
        );
      }
    }
  };

  function visitCallback(callback, path) {
    visitReferenceObject(callback, path, (value, valuePath) => {
      for (const [expression, pathItem] of Object.entries(value)) {
        visitPathItem(
          pathItem,
          [...valuePath, expression]
        );
      }
    });
  }

  // Enforce nesting limits across the entire document, including examples
  // and extension values, without interpreting their $ref properties.
  const nestingStack = [{
    value: document,
    path: [],
    depth: 0,
  }];

  while (nestingStack.length > 0) {
    const current = nestingStack.pop();

    if (current.depth > MAX_DOCUMENT_NESTING_DEPTH) {
      throw createSpecError(
        `The document exceeds the maximum nesting depth of ${MAX_DOCUMENT_NESTING_DEPTH}.`,
        {
          code: "SPEC_LIMIT_EXCEEDED",
          details: [{
            field: encodePointer(current.path),
            message: "Reduce the document's nesting depth.",
          }],
        }
      );
    }

    if (current.value === null || typeof current.value !== "object") {
      continue;
    }

    const entries = Array.isArray(current.value)
      ? current.value.map((value, index) => [String(index), value])
      : Object.entries(current.value);

    for (const [key, value] of entries) {
      nestingStack.push({
        value,
        path: [...current.path, key],
        depth: current.depth + 1,
      });
    }
  }

  // Inspect all actual Path Item locations.
  const paths = isRecord(document.paths) ? document.paths : {};

  for (const [pathName, pathItem] of Object.entries(paths)) {
    visitPathItem(pathItem, ["paths", pathName]);
  }

  const webhooks = isRecord(document.webhooks)
    ? document.webhooks
    : {};

  for (const [name, pathItem] of Object.entries(webhooks)) {
    visitPathItem(pathItem, ["webhooks", name]);
  }

  // Inspect reusable component objects according to their actual types.
  const components = isRecord(document.components)
    ? document.components
    : {};

  const componentVisitors = {
    schemas: visitSchema,
    responses: visitResponse,
    parameters: visitParameter,
    examples: visitExample,
    requestBodies: visitRequestBody,
    headers: visitHeader,
    links: (value, path) =>
      visitReferenceObject(value, path, () => {}),
    callbacks: visitCallback,
    pathItems: visitPathItem,
    mediaTypes: (value, path) =>
      visitReferenceObject(value, path, visitMediaType),
  };

  for (const [componentType, visitor] of Object.entries(componentVisitors)) {
    const entries = components[componentType];

    if (!isRecord(entries)) continue;

    for (const [name, value] of Object.entries(entries)) {
      visitor(value, ["components", componentType, name]);
    }
  }

  return {
    referenceCount: references.length,
    referenceWarnings: inspectReferenceDepth(references),
  };
};

const getPathAndOperationCounts = (document) => {
  if (
    document.paths !== undefined &&
    !isRecord(document.paths)
  ) {
    throw createSpecError(
      "The OpenAPI paths field must be an object.",
      {
        details: [{
          field: "paths",
          message: "Provide paths as an OpenAPI Path Item object.",
        }],
      }
    );
  }

  if (
    document.webhooks !== undefined &&
    !isRecord(document.webhooks)
  ) {
    throw createSpecError(
      "The OpenAPI webhooks field must be an object.",
      {
        details: [{
          field: "webhooks",
          message: "Provide webhooks as an OpenAPI Path Item map.",
        }],
      }
    );
  }

  const paths = document.paths ?? {};
  const webhooks = document.webhooks ?? {};

  const pathCount = Object.keys(paths).length;
  const webhookCount = Object.keys(webhooks).length;
  const totalEntries = pathCount + webhookCount;

  if (totalEntries > MAX_PATH_ENTRIES) {
    throw createSpecError(
      `The document exceeds the maximum of ${MAX_PATH_ENTRIES} path and webhook entries.`,
      {
        code: "SPEC_LIMIT_EXCEEDED",
        details: [{
          field: "paths",
          message:
            `Found ${pathCount} paths and ${webhookCount} webhooks.`,
        }],
      }
    );
  }

  return {
    paths,
    pathCount,
  };
};

// Shared extraction keeps operation keys and metadata consistent
// with the API Explorer's operation index.
export const extractOperations = (paths) => {
  return createOperationIndex({
    paths: isRecord(paths) ? paths : {},
  });
};

const toScalarDiagnostic = (issue) => {
  const path = issue?.path;

  const field = Array.isArray(path)
    ? path.map(String).join(".")
    : typeof path === "string"
      ? path
      : "document";

  return {
    field,
    message:
      typeof issue?.message === "string"
        ? issue.message
        : "The OpenAPI validator found an invalid construct.",
  };
};

const parseOpenApiDocument = async (
  sourceText,
  sourceFormat
) => {
  if (typeof sourceText !== "string") {
    throw createSpecError(
      "The uploaded specification must be text.",
      {
        statusCode: 400,
        details: [{
          field: "document",
          message: "Provide a JSON or YAML document.",
        }],
      }
    );
  }

  const format =
    typeof sourceFormat === "string"
      ? sourceFormat.trim().toLowerCase()
      : "";

  if (!["json", "yaml"].includes(format)) {
    throw createSpecError(
      "The specification file format is not supported.",
      {
        statusCode: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
        details: [{
          field: "sourceFormat",
          message: "Only JSON and YAML files are accepted.",
        }],
      }
    );
  }

  const normalizedSource = sourceText.replace(/^\uFEFF/u, "");
  const byteLength = Buffer.byteLength(
    normalizedSource,
    "utf8"
  );

  if (byteLength === 0) {
    throw createSpecError(
      "The uploaded specification is empty.",
      {
        statusCode: 400,
      }
    );
  }

  if (byteLength > MAX_SPEC_BYTES) {
    throw createSpecError(
      "The specification exceeds the maximum upload size of 1 MiB.",
      {
        statusCode: 413,
        code: "SPEC_LIMIT_EXCEEDED",
        details: [{
          field: "document",
          message:
            `The uploaded document is ${byteLength} bytes; the maximum is ${MAX_SPEC_BYTES} bytes.`,
        }],
      }
    );
  }

  const parsed =
    format === "json"
      ? parseJson(normalizedSource)
      : parseYaml(normalizedSource);

  const document = parsed.document;

  if (!isRecord(document)) {
    throw createSpecError(
      "The specification must have a JSON or YAML object at its root.",
      {
        details: [{
          field: "document",
          message:
            "The root document cannot be an array, scalar or null.",
        }],
      }
    );
  }

  assertSupportedVersion(document);

  const {
    paths,
    pathCount,
  } = getPathAndOperationCounts(document);

  const {
    referenceCount,
    referenceWarnings,
  } = inspectDocument(document);

  let validationResult;

  try {
    validationResult = await validate(
      JSON.stringify(document)
    );
  } catch {
    throw createSpecError(
      "The OpenAPI validator could not process this document.",
      {
        details: [{
          field: "document",
          message:
            "Check the document structure and its OpenAPI references.",
        }],
      }
    );
  }

  const validationErrors = Array.isArray(
    validationResult?.errors
  )
    ? validationResult.errors
    : [];

  if (
    validationResult?.valid !== true ||
    validationErrors.length > 0
  ) {
    const details = validationErrors
      .slice(0, 50)
      .map(toScalarDiagnostic);

    throw createSpecError(
      "The document failed OpenAPI validation.",
      {
        details:
          details.length > 0
            ? details
            : [{
                field: "document",
                message: "The OpenAPI document is not valid.",
              }],
      }
    );
  }

  // Build one shared operation index after structural and Scalar validation.
  // This includes standard methods, QUERY, additionalOperations, webhooks
  // and callback operations.
  const operations = createOperationIndex(document);

  const operationCount = operations.length;

  if (operationCount > MAX_OPERATIONS) {
    throw createSpecError(
      `The document exceeds the maximum of ${MAX_OPERATIONS} indexed operations.`,
      {
        code: "SPEC_LIMIT_EXCEEDED",
        details: [{
          field: "paths",
          message: `Found ${operationCount} indexed operations.`,
        }],
      }
    );
  }

  const scalarWarnings = Array.isArray(
    validationResult.warnings
  )
    ? validationResult.warnings.map(toScalarDiagnostic)
    : [];

  const schemaNames = isRecord(
    document.components?.schemas
  )
    ? Object.keys(document.components.schemas).sort()
    : [];

  return {
    openapiVersion: document.openapi,
    title: document.info.title,
    infoVersion: document.info.version,
    sourceFormat: format,
    pathCount,
    operationCount,
    referenceCount,
    operations,
    schemaNames,
    warnings: [
      ...parsed.warnings,
      ...scalarWarnings,
      ...referenceWarnings,
    ],
    document,
  };
};

export default parseOpenApiDocument;
