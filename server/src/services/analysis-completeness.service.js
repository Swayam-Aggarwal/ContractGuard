
import {
  STANDARD_HTTP_METHODS,
} from "../constants/openapi.js";

import createOpenApiReferenceService from
  "./openapi-reference.service.js";

const MAX_SCHEMA_INSPECTION_DEPTH = 80;
const MAX_CALLBACK_INSPECTION_DEPTH = 10;

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const createWarning = (field, message) => ({
  field,
  message,
});

const createExplorerCompleteness = (
  document,
  parserWarnings = []
) => {
  if (!isRecord(document)) {
    throw new TypeError(
      "An OpenAPI document object is required."
    );
  }

  const explorerWarnings = [];
  const warningKeys = new Set();

  const visitedSchemas = new WeakSet();
  const activePathItems = new WeakSet();
  const activeCallbacks = new WeakSet();

  const references = createOpenApiReferenceService(document);

  const addWarning = (field, message) => {
    const warning = createWarning(field, message);
    const key = `${field}\u0000${message}`;

    if (warningKeys.has(key)) return;

    warningKeys.add(key);
    explorerWarnings.push(warning);
  };

  for (const warning of parserWarnings) {
    if (
      typeof warning?.message === "string" &&
      warning.message.includes("Circular internal references")
    ) {
      addWarning(
        warning.field || "document",
        "Circular references are navigable but cannot be automatically expanded."
      );
    }
  }

  const resolveReference = (value, field, objectType) => {
    if (!isRecord(value) || typeof value.$ref !== "string") {
      return value;
    }

    const siblingFields = Object.keys(value).filter(
      (key) => key !== "$ref"
    );

    if (
      objectType === "Path Item" &&
      siblingFields.length > 0
    ) {
      addWarning(
        field,
        "Path Item references with adjacent fields are not merged; move the fields into the referenced Path Item."
      );
    }

    if (
      objectType === "Callback" &&
      siblingFields.some(
        (key) => key !== "summary" && key !== "description"
      )
    ) {
      addWarning(
        field,
        "The callback reference contains unsupported adjacent fields."
      );
    }

    try {
      const result = references.resolveObject(value, {
        sourcePointer: field,
      });

      if (result.circular) {
        addWarning(
          field,
          `Circular ${objectType.toLowerCase()} reference prevents complete inspection.`
        );

        return null;
      }

      if (!isRecord(result.value)) {
        addWarning(
          field,
          `The referenced ${objectType.toLowerCase()} is not an object.`
        );

        return null;
      }

      return result.value;
    } catch {
      addWarning(
        field,
        `The referenced ${objectType.toLowerCase()} could not be inspected.`
      );

      return null;
    }
  };

  const inspectSchema = (
    schema,
    field,
    depth = 0
  ) => {
    if (!isRecord(schema)) return;

    if (visitedSchemas.has(schema)) return;

    if (depth > MAX_SCHEMA_INSPECTION_DEPTH) {
      addWarning(
        field,
        "Nested schema inspection exceeded the supported depth."
      );

      return;
    }

    visitedSchemas.add(schema);

    const unsupportedKeywords = [
      [
        "$dynamicRef",
        "Dynamic JSON Schema references are not contextually resolved.",
      ],
      [
        "$recursiveRef",
        "Recursive JSON Schema references are not contextually resolved.",
      ],
      [
        "$dynamicAnchor",
        "Dynamic JSON Schema anchors are not interpreted.",
      ],
      [
        "$recursiveAnchor",
        "Recursive JSON Schema anchors are not interpreted.",
      ],
      [
        "$anchor",
        "Named JSON Schema anchors are not resolved.",
      ],
      [
        "$schema",
        "Explicit JSON Schema dialect declarations are not interpreted.",
      ],
      [
        "$vocabulary",
        "Custom JSON Schema vocabularies are not interpreted.",
      ],
    ];

    for (const [keyword, message] of unsupportedKeywords) {
      if (Object.hasOwn(schema, keyword)) {
        addWarning(`${field}.${keyword}`, message);
      }
    }

    if (typeof schema.$ref === "string") {
      // Internal JSON Pointer references are resolved by the parser.
      // Referenced reusable schemas are also inspected through their
      // component definitions, avoiding infinite recursive expansion.
      const siblings = Object.keys(schema).filter(
        (key) => key !== "$ref"
      );

      if (
        siblings.length > 0 &&
        /^3\.0\./u.test(document.openapi || "")
      ) {
        // OAS 3.0 ignores Schema Object siblings beside $ref.
      }
    }

    const objectKeywords = [
      "properties",
      "patternProperties",
      "$defs",
      "definitions",
      "dependentSchemas",
    ];

    for (const keyword of objectKeywords) {
      if (!isRecord(schema[keyword])) continue;

      for (const [name, nestedSchema] of Object.entries(
        schema[keyword]
      )) {
        inspectSchema(
          nestedSchema,
          `${field}.${keyword}.${name}`,
          depth + 1
        );
      }
    }

    const schemaKeywords = [
      "items",
      "additionalItems",
      "additionalProperties",
      "unevaluatedProperties",
      "unevaluatedItems",
      "propertyNames",
      "contains",
      "contentSchema",
      "if",
      "then",
      "else",
      "not",
    ];

    for (const keyword of schemaKeywords) {
      const value = schema[keyword];

      if (isRecord(value)) {
        inspectSchema(
          value,
          `${field}.${keyword}`,
          depth + 1
        );
      }
    }

    const arrayKeywords = [
      "prefixItems",
      "allOf",
      "oneOf",
      "anyOf",
    ];

    for (const keyword of arrayKeywords) {
      if (!Array.isArray(schema[keyword])) continue;

      schema[keyword].forEach((nestedSchema, index) => {
        inspectSchema(
          nestedSchema,
          `${field}.${keyword}.${index}`,
          depth + 1
        );
      });
    }

    if (isRecord(schema.dependencies)) {
      for (const [name, dependency] of Object.entries(
        schema.dependencies
      )) {
        if (isRecord(dependency)) {
          inspectSchema(
            dependency,
            `${field}.dependencies.${name}`,
            depth + 1
          );
        }
      }
    }
  };

  const inspectMediaType = (mediaType, field) => {
    if (!isRecord(mediaType)) return;

    if (typeof mediaType.$ref === "string") {
      addWarning(
        `${field}.$ref`,
        "Referenced Media Type Objects are not expanded inside request and response content."
      );
    }

    if (isRecord(mediaType.schema)) {
      inspectSchema(
        mediaType.schema,
        `${field}.schema`
      );
    }

    if (isRecord(mediaType.itemSchema)) {
      addWarning(
        `${field}.itemSchema`,
        "Streaming item schemas are preserved but are not independently navigated by the explorer."
      );

      inspectSchema(
        mediaType.itemSchema,
        `${field}.itemSchema`
      );
    }

    for (const keyword of [
      "prefixEncoding",
      "itemEncoding",
    ]) {
      if (Object.hasOwn(mediaType, keyword)) {
        addWarning(
          `${field}.${keyword}`,
          "Positional media-type encoding is preserved but is not interpreted by the explorer."
        );
      }
    }
  };

  const inspectContent = (content, field) => {
    if (!isRecord(content)) return;

    for (const [mediaTypeName, mediaType] of Object.entries(content)) {
      inspectMediaType(
        mediaType,
        `${field}.${mediaTypeName}`
      );
    }
  };

  const inspectParameter = (parameter, field) => {
    if (!isRecord(parameter)) return;

    if (typeof parameter.$ref === "string") {
      const resolved = resolveReference(
        parameter,
        field,
        "Parameter"
      );

      if (resolved) {
        inspectParameter(resolved, `${field}.resolved`);
      }

      return;
    }

    if (parameter.in === "querystring") {
      addWarning(
        `${field}.in`,
        "Querystring parameter serialization semantics are not interpreted by the explorer."
      );
    }

    if (isRecord(parameter.schema)) {
      inspectSchema(
        parameter.schema,
        `${field}.schema`
      );
    }

    inspectContent(
      parameter.content,
      `${field}.content`
    );
  };

  const inspectParameters = (parameters, field) => {
    if (!Array.isArray(parameters)) return;

    parameters.forEach((parameter, index) => {
      inspectParameter(
        parameter,
        `${field}.${index}`
      );
    });
  };

  const inspectHeader = (header, field) => {
    if (!isRecord(header)) return;

    if (typeof header.$ref === "string") {
      const resolved = resolveReference(
        header,
        field,
        "Header"
      );

      if (resolved) {
        inspectHeader(resolved, `${field}.resolved`);
      }

      return;
    }

    if (isRecord(header.schema)) {
      inspectSchema(
        header.schema,
        `${field}.schema`
      );
    }

    inspectContent(
      header.content,
      `${field}.content`
    );
  };

  const inspectRequestBody = (requestBody, field) => {
    if (!isRecord(requestBody)) return;

    if (typeof requestBody.$ref === "string") {
      const resolved = resolveReference(
        requestBody,
        field,
        "Request Body"
      );

      if (resolved) {
        inspectRequestBody(resolved, `${field}.resolved`);
      }

      return;
    }

    inspectContent(
      requestBody.content,
      `${field}.content`
    );
  };

  const inspectResponse = (response, field) => {
    if (!isRecord(response)) return;

    if (typeof response.$ref === "string") {
      const resolved = resolveReference(
        response,
        field,
        "Response"
      );

      if (resolved) {
        inspectResponse(resolved, `${field}.resolved`);
      }

      return;
    }

    if (isRecord(response.headers)) {
      for (const [name, header] of Object.entries(response.headers)) {
        inspectHeader(
          header,
          `${field}.headers.${name}`
        );
      }
    }

    inspectContent(
      response.content,
      `${field}.content`
    );
  };

  const inspectResponses = (responses, field) => {
    if (!isRecord(responses)) return;

    for (const [statusCode, response] of Object.entries(responses)) {
      inspectResponse(
        response,
        `${field}.${statusCode}`
      );
    }
  };

  const inspectPathItem = (
    pathItem,
    field,
    callbackDepth = 0
  ) => {
    if (!isRecord(pathItem)) return;

    let effectivePathItem = pathItem;

    if (typeof pathItem.$ref === "string") {
      effectivePathItem = resolveReference(
        pathItem,
        field,
        "Path Item"
      );

      if (!effectivePathItem) return;

      // The operation index separately rejects non-empty Path Item
      // siblings, so inspection of the referenced target is sufficient.
    }

    if (activePathItems.has(effectivePathItem)) {
      addWarning(
        field,
        "A circular Path Item reference prevents complete inspection."
      );

      return;
    }

    activePathItems.add(effectivePathItem);

    try {
      inspectParameters(
        effectivePathItem.parameters,
        `${field}.parameters`
      );

      for (const method of STANDARD_HTTP_METHODS) {
        if (isRecord(effectivePathItem[method])) {
          inspectOperation(
            effectivePathItem[method],
            `${field}.${method}`,
            callbackDepth
          );
        }
      }

      if (isRecord(effectivePathItem.additionalOperations)) {
        for (const [method, operation] of Object.entries(
          effectivePathItem.additionalOperations
        )) {
          inspectOperation(
            operation,
            `${field}.additionalOperations.${method}`,
            callbackDepth
          );
        }
      }
    } finally {
      activePathItems.delete(effectivePathItem);
    }
  };

  const inspectCallback = (
    callback,
    field,
    callbackDepth = 0
  ) => {
    if (!isRecord(callback)) return;

    let effectiveCallback = callback;

    if (typeof callback.$ref === "string") {
      effectiveCallback = resolveReference(
        callback,
        field,
        "Callback"
      );

      if (!effectiveCallback) return;
    }

    if (activeCallbacks.has(effectiveCallback)) {
      addWarning(
        field,
        "A circular callback reference prevents complete inspection."
      );

      return;
    }

    if (callbackDepth >= MAX_CALLBACK_INSPECTION_DEPTH) {
      addWarning(
        field,
        "Nested callback inspection exceeded the supported depth."
      );

      return;
    }

    activeCallbacks.add(effectiveCallback);

    try {
      for (const [expression, pathItem] of Object.entries(
        effectiveCallback
      )) {
        if (!isRecord(pathItem)) continue;

        inspectPathItem(
          pathItem,
          `${field}.${expression}`,
          callbackDepth + 1
        );
      }
    } finally {
      activeCallbacks.delete(effectiveCallback);
    }
  };

  const inspectOperation = (
    operation,
    field,
    callbackDepth = 0
  ) => {
    if (!isRecord(operation)) return;

    inspectParameters(
      operation.parameters,
      `${field}.parameters`
    );

    inspectRequestBody(
      operation.requestBody,
      `${field}.requestBody`
    );

    inspectResponses(
      operation.responses,
      `${field}.responses`
    );

    if (isRecord(operation.callbacks)) {
      for (const [name, callback] of Object.entries(
        operation.callbacks
      )) {
        inspectCallback(
          callback,
          `${field}.callbacks.${name}`,
          callbackDepth
        );
      }
    }
  };

  // Inspect ordinary API paths and webhooks.
  for (const [path, pathItem] of Object.entries(
    isRecord(document.paths) ? document.paths : {}
  )) {
    inspectPathItem(
      pathItem,
      `paths.${path}`
    );
  }

  for (const [name, pathItem] of Object.entries(
    isRecord(document.webhooks) ? document.webhooks : {}
  )) {
    inspectPathItem(
      pathItem,
      `webhooks.${name}`
    );
  }

  // Inspect all reusable components, including targets referenced from
  // operations. This prevents referenced Path Items and callbacks from
  // being incorrectly marked COMPLETE without inspecting their contents.
  const components = isRecord(document.components)
    ? document.components
    : {};

  if (isRecord(components.schemas)) {
    for (const [name, schema] of Object.entries(
      components.schemas
    )) {
      inspectSchema(
        schema,
        `components.schemas.${name}`
      );
    }
  }

  if (isRecord(components.parameters)) {
    for (const [name, parameter] of Object.entries(
      components.parameters
    )) {
      inspectParameter(
        parameter,
        `components.parameters.${name}`
      );
    }
  }

  if (isRecord(components.requestBodies)) {
    for (const [name, requestBody] of Object.entries(
      components.requestBodies
    )) {
      inspectRequestBody(
        requestBody,
        `components.requestBodies.${name}`
      );
    }
  }

  if (isRecord(components.responses)) {
    for (const [name, response] of Object.entries(
      components.responses
    )) {
      inspectResponse(
        response,
        `components.responses.${name}`
      );
    }
  }

  if (isRecord(components.headers)) {
    for (const [name, header] of Object.entries(
      components.headers
    )) {
      inspectHeader(
        header,
        `components.headers.${name}`
      );
    }
  }

  if (isRecord(components.pathItems)) {
    for (const [name, pathItem] of Object.entries(
      components.pathItems
    )) {
      inspectPathItem(
        pathItem,
        `components.pathItems.${name}`
      );
    }
  }

  if (isRecord(components.callbacks)) {
    for (const [name, callback] of Object.entries(
      components.callbacks
    )) {
      inspectCallback(
        callback,
        `components.callbacks.${name}`
      );
    }
  }

  if (isRecord(components.mediaTypes)) {
    for (const [name, mediaType] of Object.entries(
      components.mediaTypes
    )) {
      inspectMediaType(
        mediaType,
        `components.mediaTypes.${name}`
      );
    }
  }

  if (typeof document.jsonSchemaDialect === "string") {
    addWarning(
      "jsonSchemaDialect",
      "The document-level JSON Schema dialect is not interpreted."
    );
  }

  return {
    explorerCompleteness:
      explorerWarnings.length > 0 ? "PARTIAL" : "COMPLETE",
    explorerWarnings,
  };
};

export default createExplorerCompleteness;
