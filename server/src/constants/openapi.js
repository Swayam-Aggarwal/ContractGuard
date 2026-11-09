export const STANDARD_HTTP_METHODS = Object.freeze([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
]);

export const ADDITIONAL_OPERATION_METHOD_PATTERN =
  /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

export const OPENAPI_COMPONENT_TYPES = Object.freeze([
  "schemas",
  "responses",
  "parameters",
  "examples",
  "requestBodies",
  "headers",
  "securitySchemes",
  "links",
  "callbacks",
  "pathItems",
  "mediaTypes",
]);

export const OPENAPI_COMPONENT_TYPE_SET = new Set(
  OPENAPI_COMPONENT_TYPES
);

export const MAX_EXPLORER_REFERENCE_DEPTH = 20;
export const MAX_EXPLORER_CALLBACK_DEPTH = 10;