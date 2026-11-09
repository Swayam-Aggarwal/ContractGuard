
import { useMemo, useState } from "react";

import {
  Link,
  useParams,
} from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  Braces,
  ChevronDown,
  Code2,
  ExternalLink,
  FileCode2,
  FileJson,
  Filter,
  Layers3,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  useProject,
} from "../features/projects/projects.js";

import {
  useSpecificationOperations,
  useSpecificationOperation,
  useSpecificationComponents,
  useSpecificationComponent,
} from "../features/specifications/specifications.js";

import ReferenceNavigator from "../components/ReferenceNavigator.jsx";

import "./ApiExplorerPage.css";

const EMPTY_ARRAY = Object.freeze([]);

const COMPONENT_LABELS = {
  schemas: "Schemas",
  responses: "Responses",
  parameters: "Parameters",
  examples: "Examples",
  requestBodies: "Request bodies",
  headers: "Headers",
  securitySchemes: "Security schemes",
  links: "Links",
  callbacks: "Callbacks",
  pathItems: "Path items",
  mediaTypes: "Media types",
};

const METHOD_TONES = {
  GET: "get",
  POST: "post",
  PUT: "put",
  PATCH: "patch",
  DELETE: "delete",
  HEAD: "head",
  OPTIONS: "options",
  TRACE: "trace",
  QUERY: "query",
};

const isRecord = (value) => (
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value)
);

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const getMethodTone = (method) => (
  METHOD_TONES[String(method || "").toUpperCase()] || "custom"
);

const getSchemaType = (schema) => {
  if (!isRecord(schema)) return "—";

  if (typeof schema.type === "string") return schema.type;

  if (Array.isArray(schema.type)) {
    return schema.type.join(" | ");
  }

  if (schema.$ref) return "Reference";
  if (schema.enum) return "Enum";
  if (schema.allOf) return "All of";
  if (schema.oneOf) return "One of";
  if (schema.anyOf) return "Any of";

  return "Object";
};

const CodePreview = ({
  value,
  emptyLabel = "No definition provided.",
}) => {
  if (value === undefined || value === null) {
    return (
      <div className="explorer-code-empty">
        {emptyLabel}
      </div>
    );
  }

  let formattedValue;

  try {
    formattedValue = JSON.stringify(value, null, 2);
  } catch {
    formattedValue = String(value);
  }

  return (
    <details className="explorer-code-details">
      <summary>
        <Code2 size={14} />
        View JSON definition
        <ChevronDown
          size={14}
          className="explorer-code-chevron"
        />
      </summary>

      <pre>{formattedValue}</pre>
    </details>
  );
};

const MethodBadge = ({ method }) => (
  <span
    className={`explorer-method explorer-method-${getMethodTone(method)}`}
  >
    {method}
  </span>
);

const CoverageBadge = ({ status }) => {
  const complete = status === "COMPLETE";

  return (
    <span
      className={`explorer-coverage ${
        complete ? "is-complete" : "is-partial"
      }`}
    >
      {complete ? (
        <ShieldCheck size={14} />
      ) : (
        <ShieldAlert size={14} />
      )}

      {complete ? "Complete coverage" : "Partial coverage"}
    </span>
  );
};

const SectionHeader = ({
  eyebrow,
  title,
  description,
  action,
}) => (
  <div className="explorer-section-header">
    <div>
      {eyebrow && (
        <span className="eyebrow">{eyebrow}</span>
      )}

      <h2>{title}</h2>

      {description && <p>{description}</p>}
    </div>

    {action}
  </div>
);

const QueryError = ({ error, onRetry }) => (
  <div className="explorer-query-error" role="alert">
    <AlertCircle size={18} />

    <div>
      <strong>Unable to load this information</strong>

      <p>
        {error?.message || "The request could not be completed."}
      </p>

      {onRetry && (
        <button
          type="button"
          className="explorer-text-button"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  </div>
);

const OperationListItem = ({
  operation,
  isActive,
  onClick,
}) => (
  <button
    type="button"
    className={`explorer-operation-item ${
      isActive ? "is-active" : ""
    }`}
    onClick={onClick}
    aria-pressed={isActive}
  >
    <div className="explorer-operation-item-top">
      <MethodBadge method={operation.method} />

      {operation.deprecated && (
        <span className="explorer-mini-badge is-deprecated">
          Deprecated
        </span>
      )}

      {operation.kind !== "path" && (
        <span className="explorer-mini-badge">
          {operation.kind}
        </span>
      )}
    </div>

    <span className="explorer-operation-path">
      {operation.path}
    </span>

    <span className="explorer-operation-summary">
      {operation.summary ||
        operation.operationId ||
        "No summary provided"}
    </span>

    <span className="explorer-operation-meta">
      {operation.operationId || "No operation ID"}
      <span>·</span>
      {operation.parameterCount} params
    </span>
  </button>
);

const WarningBanner = ({ specification }) => {
  if (!specification) return null;

  const parserWarnings = specification.warnings || EMPTY_ARRAY;
  const explorerWarnings =
    specification.explorerWarnings || EMPTY_ARRAY;

  const isPartial =
    specification.explorerCompleteness === "PARTIAL" ||
    explorerWarnings.length > 0;

  if (!isPartial && parserWarnings.length === 0) {
    return null;
  }

  return (
    <section className="explorer-warning-banner">
      <div className="explorer-warning-icon">
        <AlertCircle size={19} />
      </div>

      <div className="explorer-warning-content">
        <strong>
          {isPartial
            ? "Some OpenAPI constructs are not fully represented"
            : "Parser diagnostics are available"}
        </strong>

        <p>
          {isPartial
            ? "The specification was accepted, but some constructs are outside the current Explorer support. Review the diagnostics before relying on the displayed operation inventory."
            : "The parser recorded warnings for this specification. Review them before interpreting the document."}
        </p>

        <div className="explorer-warning-counts">
          <span>{parserWarnings.length} parser warnings</span>
          <span>{explorerWarnings.length} explorer warnings</span>
        </div>

        {(parserWarnings.length > 0 ||
          explorerWarnings.length > 0) && (
          <details className="explorer-warning-details">
            <summary>View diagnostics</summary>

            {[...parserWarnings, ...explorerWarnings].map(
              (warning, index) => (
                <div
                  className="explorer-warning-item"
                  key={`${warning.field || "warning"}-${index}`}
                >
                  <code>{warning.field || "document"}</code>
                  <span>{warning.message}</span>
                </div>
              )
            )}
          </details>
        )}
      </div>
    </section>
  );
};

const ParameterSection = ({ parameters }) => {
  if (!parameters?.length) {
    return (
      <div className="explorer-empty-inline">
        This operation does not declare any parameters.
      </div>
    );
  }

  return (
    <div className="explorer-table-wrap">
      <table className="explorer-data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Location</th>
            <th>Type</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>

        <tbody>
          {parameters.map((parameter, index) => {
            const type = parameter.schema
              ? getSchemaType(parameter.schema)
              : parameter.content
                ? Object.keys(parameter.content).join(", ")
                : "—";

            return (
              <tr
                key={`${parameter.name || "parameter"}-${
                  parameter.in || "unknown"
                }-${index}`}
              >
                <td>
                  <strong>
                    {parameter.name || "Unnamed parameter"}
                  </strong>

                  {parameter.deprecated && (
                    <span className="explorer-inline-muted">
                      Deprecated
                    </span>
                  )}
                </td>

                <td>
                  <span className="explorer-location-pill">
                    {parameter.in || "Unknown"}
                  </span>
                </td>

                <td>
                  <code>{type}</code>
                </td>

                <td>
                  {parameter.required ? (
                    <span className="explorer-required">
                      Required
                    </span>
                  ) : (
                    <span className="explorer-optional">
                      Optional
                    </span>
                  )}
                </td>

                <td>
                  <span className="explorer-description-cell">
                    {parameter.description || "—"}
                  </span>

                  {(parameter.schema || parameter.content) && (
                    <CodePreview
                      value={
                        parameter.schema || parameter.content
                      }
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const RequestBodySection = ({
  requestBody,
  reference,
}) => {
  if (!requestBody) {
    return (
      <div className="explorer-empty-inline">
        This operation does not declare a request body.
      </div>
    );
  }

  const content = isRecord(requestBody.content)
    ? Object.entries(requestBody.content)
    : [];

  return (
    <div className="explorer-body-block">
      <div className="explorer-body-header">
        <div>
          <strong>Request body</strong>

          <p>
            {requestBody.description || "No description provided."}
          </p>
        </div>

        {requestBody.required ? (
          <span className="explorer-required">Required</span>
        ) : (
          <span className="explorer-optional">Optional</span>
        )}
      </div>

      {reference?.ref && (
        <div className="explorer-reference-note">
          Reference: <code>{reference.ref}</code>
        </div>
      )}

      {content.length === 0 ? (
        <div className="explorer-empty-inline">
          No media type definitions are available.
        </div>
      ) : (
        content.map(([mediaType, definition]) => (
          <div className="explorer-media-block" key={mediaType}>
            <div className="explorer-media-heading">
              <FileJson size={14} />
              <code>{mediaType}</code>
            </div>

            {definition.schema && (
              <div className="explorer-schema-summary">
                <span>Schema type</span>
                <strong>
                  {getSchemaType(definition.schema)}
                </strong>
              </div>
            )}

            <CodePreview value={definition.schema} />

            <CodePreview
              value={definition.encoding}
              emptyLabel="No encoding information."
            />
          </div>
        ))
      )}
    </div>
  );
};

const ResponseSection = ({
  responses,
  references,
}) => {
  if (
    !isRecord(responses) ||
    Object.keys(responses).length === 0
  ) {
    return (
      <div className="explorer-empty-inline">
        No response definitions are available for this operation.
      </div>
    );
  }

  return (
    <div className="explorer-response-list">
      {Object.entries(responses).map(
        ([statusCode, response]) => {
          const content = isRecord(response?.content)
            ? Object.entries(response.content)
            : [];

          const reference = references?.[statusCode];

          return (
            <article
              className="explorer-response-item"
              key={statusCode}
            >
              <div className="explorer-response-heading">
                <span className="explorer-response-code">
                  {statusCode}
                </span>

                <div>
                  <strong>
                    {response?.description ||
                      "No response description"}
                  </strong>

                  {reference?.ref && (
                    <span className="explorer-response-reference">
                      Ref: {reference.ref}
                    </span>
                  )}
                </div>
              </div>

              {content.length > 0 && (
                <div className="explorer-response-content">
                  {content.map(
                    ([mediaType, definition]) => (
                      <div
                        className="explorer-media-block"
                        key={mediaType}
                      >
                        <div className="explorer-media-heading">
                          <FileJson size={14} />
                          <code>{mediaType}</code>
                        </div>

                        {definition.schema && (
                          <div className="explorer-schema-summary">
                            <span>Schema type</span>
                            <strong>
                              {getSchemaType(definition.schema)}
                            </strong>
                          </div>
                        )}

                        <CodePreview
                          value={definition.schema}
                        />
                      </div>
                    )
                  )}
                </div>
              )}

              {content.length === 0 && (
                <p className="explorer-empty-response">
                  No response content schema declared.
                </p>
              )}
            </article>
          );
        }
      )}
    </div>
  );
};

/*
 * Convert the backend's response-reference metadata into
 * explicit navigator entries.
 *
 * The backend returns:
 * responseReferences: {
 *   "200": {
 *     ref: "#/components/schemas/Product",
 *     targetPointer: "...",
 *     chain: [],
 *     circular: false
 *   }
 * }
 */
const getResponseReferenceEntries = (
  responseReferences,
  sourcePointer
) => {
  if (!isRecord(responseReferences)) {
    return [];
  }

  return Object.entries(responseReferences).flatMap(
    ([statusCode, reference]) => {
      if (typeof reference?.ref !== "string") {
        return [];
      }

      return [
        {
          reference: reference.ref,
          label: `Response ${statusCode}`,
          sourcePointer: reference.sourcePointer ||
            `${sourcePointer || "#"}/responses/${statusCode}`,
        },
      ];
    }
  );
};

const getParameterReferenceEntries = (parameters) => {
  if (!Array.isArray(parameters)) {
    return [];
  }

  return parameters.flatMap((parameter, index) => {
    const reference = parameter?.reference;

    if (typeof reference?.ref !== "string") {
      return [];
    }

    return [
      {
        reference: reference.ref,
        label: `Parameter ${index + 1}: ${
          parameter.name || "Unnamed"
        } (${parameter.in || "unknown location"})`,
        sourcePointer: reference.sourcePointer,
      },
    ];
  });
};

const OperationDetails = ({
  specification,
  specVersionId,
  operationQuery,
}) => {
  if (operationQuery.isPending) {
    return (
      <div className="explorer-detail-loading">
        <span className="spinner" />
        Loading operation details...
      </div>
    );
  }

  if (operationQuery.isError) {
    return (
      <QueryError
        error={operationQuery.error}
        onRetry={() => operationQuery.refetch()}
      />
    );
  }

  const operation = operationQuery.data?.operation;

  if (!operation) {
    return (
      <div className="explorer-detail-empty">
        Select an operation to inspect its contract.
      </div>
    );
  }

  const responses =
    isRecord(operation.resolvedResponses) &&
    Object.keys(operation.resolvedResponses).length > 0
      ? operation.resolvedResponses
      : operation.responses;

  /*
   * Keep raw and resolved objects separate.
   * Raw responses contain the original $ref values.
   * Resolved responses contain the backend's inspected targets.
   */
  const referenceRoots = [
    {
      label: "Original operation definition",
      pointer: operation.sourcePointer,
      value: operation.operation || operation,
    },
    {
      label: "Raw response definitions",
      pointer: `${operation.sourcePointer || "#"}/responses`,
      value: operation.responses,
    },
    {
      label: "Resolved response definitions",
      pointer: `${operation.sourcePointer || "#"}/resolvedResponses`,
      value: operation.resolvedResponses,
    },
    {
      label: "Raw request body",
      pointer: `${operation.sourcePointer || "#"}/requestBody`,
      value: operation.requestBody,
    },
    {
      label: "Resolved request body",
      pointer: `${operation.sourcePointer || "#"}/resolvedRequestBody`,
      value: operation.resolvedRequestBody,
    },
    {
      label: "Operation parameters",
      pointer: `${operation.sourcePointer || "#"}/parameters`,
      value: operation.parameters,
    },
  ];

  /*
   * Explicit metadata ensures that top-level response
   * references are discoverable even when the response
   * is already represented by a resolved object elsewhere.
   */
  const explicitReferences = [
    ...getParameterReferenceEntries(operation.parameters),

    ...(operation.requestBodyReference?.ref
      ? [
          {
            reference: operation.requestBodyReference.ref,
            label: "Request body",
            sourcePointer:
              operation.requestBodyReference.sourcePointer,
          },
        ]
      : []),

    ...getResponseReferenceEntries(
      operation.responseReferences,
      operation.sourcePointer
    ),
  ];

  return (
    <div className="explorer-operation-detail">
      <div className="explorer-detail-heading">
        <div className="explorer-operation-title-line">
          <MethodBadge method={operation.method} />

          {operation.deprecated && (
            <span className="explorer-mini-badge is-deprecated">
              Deprecated
            </span>
          )}

          {operation.kind !== "path" && (
            <span className="explorer-mini-badge">
              {operation.kind}
            </span>
          )}
        </div>

        <div className="explorer-endpoint-line">
          <h2>{operation.path}</h2>
        </div>

        <p className="explorer-operation-description">
          {operation.summary ||
            operation.description ||
            "No operation summary is available."}
        </p>

        {operation.description &&
          operation.summary &&
          operation.description !== operation.summary && (
            <p className="explorer-operation-long-description">
              {operation.description}
            </p>
          )}

        <div className="explorer-tags">
          {operation.tags?.length > 0 ? (
            operation.tags.map((tag) => (
              <span className="explorer-tag" key={tag}>
                {tag}
              </span>
            ))
          ) : (
            <span className="explorer-tag is-muted">
              Untagged
            </span>
          )}
        </div>
      </div>

      <div className="explorer-operation-stat-grid">
        <div>
          <span>Operation ID</span>
          <strong>
            {operation.operationId || "Not provided"}
          </strong>
        </div>

        <div>
          <span>Parameters</span>
          <strong>{operation.parameterCount}</strong>
        </div>

        <div>
          <span>Request body</span>
          <strong>
            {operation.hasRequestBody ? "Defined" : "Not defined"}
          </strong>
        </div>

        <div>
          <span>Documented responses</span>
          <strong>
            {Object.keys(responses || {}).length}
          </strong>
        </div>
      </div>

      <div className="explorer-detail-sections">
        <section className="explorer-detail-section">
          <SectionHeader
            eyebrow="INPUT CONTRACT"
            title="Parameters"
            description="Path-level and operation-level parameters resolved by the backend."
          />

          <ParameterSection
            parameters={operation.parameters || EMPTY_ARRAY}
          />
        </section>

        <section className="explorer-detail-section">
          <SectionHeader
            eyebrow="REQUEST CONTRACT"
            title="Request body"
            description="Accepted request payloads and media types."
          />

          <RequestBodySection
            requestBody={
              operation.resolvedRequestBody ||
              operation.requestBody
            }
            reference={operation.requestBodyReference}
          />
        </section>

        <section className="explorer-detail-section">
          <SectionHeader
            eyebrow="OUTPUT CONTRACT"
            title="Responses"
            description="Documented status codes and response schemas."
          />

          <ResponseSection
            responses={responses}
            references={operation.responseReferences}
          />
        </section>

        <section className="explorer-detail-section">
          <SectionHeader
            eyebrow="ADDITIONAL INFORMATION"
            title="Security and servers"
            description="Operation-level security requirements and applicable server definitions."
          />

          <div className="explorer-additional-grid">
            <div>
              <h4>Security requirements</h4>
              <CodePreview
                value={operation.security || EMPTY_ARRAY}
              />
            </div>

            <div>
              <h4>Server definitions</h4>
              <CodePreview
                value={operation.servers || EMPTY_ARRAY}
              />
            </div>
          </div>
        </section>

        <section className="explorer-source-section">
          <span>Source location</span>
          <code>{operation.sourcePointer}</code>
        </section>
      </div>

      <ReferenceNavigator
        key={operation.operationKey}
        specVersionId={specVersionId}
        title="Operation reference navigator"
        roots={referenceRoots}
        explicitReferences={explicitReferences}
      />

      {specification?.explorerCompleteness === "PARTIAL" && (
        <div className="explorer-detail-partial-note">
          <AlertCircle size={15} />

          This operation belongs to a specification with
          partial Explorer coverage.
        </div>
      )}
    </div>
  );
};

const ComponentsBrowser = ({
  specVersionId,
  componentCategories,
}) => {
  const [componentType, setComponentType] = useState("schemas");
  const [selectedComponentName, setSelectedComponentName] =
    useState("");
  const [search, setSearch] = useState("");

  const categories = componentCategories || EMPTY_ARRAY;

  const availableCategory =
    categories.find(
      (category) => category.type === componentType
    ) || categories[0];

  const activeComponentType =
    availableCategory?.type || componentType;

  const componentsQuery = useSpecificationComponents(
    specVersionId,
    activeComponentType
  );

  const components =
    componentsQuery.data?.components ?? EMPTY_ARRAY;

  const filteredComponents = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return components;

    return components.filter((component) => (
      component.name.toLowerCase().includes(value) ||
      component.pointer.toLowerCase().includes(value) ||
      (component.description || "").toLowerCase().includes(value)
    ));
  }, [components, search]);

  const selectedComponent = components.find(
    (component) => component.name === selectedComponentName
  );

  const activeComponentName =
    selectedComponent?.name ||
    filteredComponents[0]?.name ||
    components[0]?.name ||
    "";

  const componentQuery = useSpecificationComponent(
    specVersionId,
    activeComponentType,
    activeComponentName
  );

  const componentData = componentQuery.data;

  const componentValue =
    componentData?.resolvedComponent ??
    componentData?.component;

  const properties = isRecord(componentValue?.properties)
    ? Object.entries(componentValue.properties)
    : EMPTY_ARRAY;

  const requiredProperties = Array.isArray(componentValue?.required)
    ? componentValue.required
    : EMPTY_ARRAY;

  return (
    <div className="explorer-components-layout">
      <aside className="explorer-components-sidebar">
        <div className="explorer-component-filter">
          <label htmlFor="component-category">
            Component category
          </label>

          <select
            id="component-category"
            value={activeComponentType}
            onChange={(event) => {
              setComponentType(event.target.value);
              setSelectedComponentName("");
              setSearch("");
            }}
          >
            {categories.map((category) => (
              <option
                key={category.type}
                value={category.type}
              >
                {COMPONENT_LABELS[category.type] ||
                  category.type} ({category.count})
              </option>
            ))}
          </select>
        </div>

        <div className="explorer-component-search">
          <Search size={14} />

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search components..."
            aria-label="Search components"
          />

          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear component search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {componentsQuery.isPending ? (
          <div className="explorer-component-list-loading">
            <span className="spinner" />
            Loading components...
          </div>
        ) : componentsQuery.isError ? (
          <QueryError
            error={componentsQuery.error}
            onRetry={() => componentsQuery.refetch()}
          />
        ) : filteredComponents.length === 0 ? (
          <div className="explorer-component-empty">
            No components found in this category.
          </div>
        ) : (
          <div className="explorer-component-list">
            {filteredComponents.map((component) => (
              <button
                type="button"
                key={component.name}
                className={`explorer-component-item ${
                  component.name === activeComponentName
                    ? "is-active"
                    : ""
                }`}
                onClick={() =>
                  setSelectedComponentName(component.name)
                }
                aria-pressed={
                  component.name === activeComponentName
                }
              >
                <span className="explorer-component-item-icon">
                  <Braces size={15} />
                </span>

                <span className="explorer-component-item-copy">
                  <strong>{component.name}</strong>

                  <span>
                    {component.type ||
                      (component.isReference
                        ? "Reference"
                        : "Component")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="explorer-component-detail">
        {!activeComponentName ? (
          <div className="explorer-detail-empty">
            <div className="explorer-detail-empty-icon">
              <Layers3 size={24} />
            </div>

            <h3>No components available</h3>

            <p>
              This specification does not define components
              in the selected category.
            </p>
          </div>
        ) : componentQuery.isPending ? (
          <div className="explorer-detail-loading">
            <span className="spinner" />
            Resolving component...
          </div>
        ) : componentQuery.isError ? (
          <QueryError
            error={componentQuery.error}
            onRetry={() => componentQuery.refetch()}
          />
        ) : (
          <>
            <div className="explorer-component-detail-header">
              <span className="eyebrow">
                {COMPONENT_LABELS[activeComponentType] ||
                  activeComponentType}
              </span>

              <h2>{componentData.componentName}</h2>

              <div className="explorer-component-detail-meta">
                <span>
                  <FileCode2 size={13} />
                  {componentData.pointer}
                </span>

                {componentData.reference?.ref && (
                  <span>
                    <ExternalLink size={13} />
                    Referenced definition
                  </span>
                )}
              </div>
            </div>

            {componentData.reference && (
              <div className="explorer-reference-panel">
                <strong>Reference information</strong>

                <code>{componentData.reference.ref}</code>

                <span>
                  Target:{" "}
                  {componentData.reference.targetPointer ||
                    "Unresolved"}
                </span>

                {componentData.reference.circular && (
                  <span className="explorer-reference-warning">
                    This reference is circular. The original
                    reference definition is shown.
                  </span>
                )}
              </div>
            )}

            <div className="explorer-component-summary-grid">
              <div>
                <span>Type</span>
                <strong>
                  {getSchemaType(componentValue)}
                </strong>
              </div>

              <div>
                <span>Properties</span>
                <strong>{properties.length}</strong>
              </div>

              <div>
                <span>Required fields</span>
                <strong>{requiredProperties.length}</strong>
              </div>

              <div>
                <span>Deprecated</span>
                <strong>
                  {componentValue?.deprecated ? "Yes" : "No"}
                </strong>
              </div>
            </div>

            {properties.length > 0 && (
              <section className="explorer-component-properties">
                <SectionHeader
                  eyebrow="OBJECT STRUCTURE"
                  title="Properties"
                  description="Fields declared by this schema."
                />

                <div className="explorer-property-list">
                  {properties.map(([name, schema]) => (
                    <div
                      className="explorer-property-item"
                      key={name}
                    >
                      <div>
                        <strong>{name}</strong>

                        {requiredProperties.includes(name) ? (
                          <span className="explorer-required">
                            Required
                          </span>
                        ) : (
                          <span className="explorer-optional">
                            Optional
                          </span>
                        )}
                      </div>

                      <code>{getSchemaType(schema)}</code>

                      {schema?.description && (
                        <p>{schema.description}</p>
                      )}

                      <CodePreview value={schema} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="explorer-component-definition">
              <SectionHeader
                eyebrow="SOURCE DEFINITION"
                title="Component definition"
                description="Original and resolved component data returned by the backend."
              />

              <CodePreview value={componentData.component} />
            </section>

            {componentData.resolvedComponent !== undefined && (
              <section className="explorer-component-definition">
                <SectionHeader
                  eyebrow="REFERENCE RESOLUTION"
                  title="Resolved definition"
                  description="The backend's resolved representation of this component."
                />

                <CodePreview
                  value={componentData.resolvedComponent}
                />
              </section>
            )}

            <ReferenceNavigator
              key={`${componentData.componentType}:${componentData.componentName}`}
              specVersionId={specVersionId}
              title="Component reference navigator"
              roots={[
                {
                  label: "Original component",
                  pointer: componentData.pointer,
                  value: componentData.component,
                },
                ...(componentData.resolvedComponent !== undefined
                  ? [
                      {
                        label: "Resolved component",
                        pointer:
                          componentData.reference?.targetPointer ||
                          componentData.pointer,
                        value: componentData.resolvedComponent,
                      },
                    ]
                  : []),
              ]}
              explicitReferences={
                componentData.reference?.ref
                  ? [
                      {
                        reference: componentData.reference.ref,
                        label: "Component reference",
                        sourcePointer: componentData.pointer,
                      },
                    ]
                  : []
              }
            />
          </>
        )}
      </section>
    </div>
  );
};

const ApiExplorerPage = () => {
  const { projectId, specVersionId } = useParams();

  const [activeTab, setActiveTab] = useState("operations");
  const [selectedOperationKey, setSelectedOperationKey] =
    useState("");
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  const projectQuery = useProject(projectId);

  const operationsQuery =
    useSpecificationOperations(specVersionId);

  const operations =
    operationsQuery.data?.operations ?? EMPTY_ARRAY;

  const specification =
    operationsQuery.data?.specification;

  const schemas =
    operationsQuery.data?.schemas ?? EMPTY_ARRAY;

  const componentCategories =
    operationsQuery.data?.componentCategories ?? EMPTY_ARRAY;

  const activeOperationKey = operations.some(
    (operation) =>
      operation.operationKey === selectedOperationKey
  )
    ? selectedOperationKey
    : operations[0]?.operationKey || "";

  const operationQuery = useSpecificationOperation(
    specVersionId,
    activeOperationKey
  );

  const methodOptions = useMemo(
    () => [
      ...new Set(
        operations.map((operation) =>
          String(operation.method).toUpperCase()
        )
      ),
    ].sort(),
    [operations]
  );

  const tagOptions = useMemo(
    () => [
      ...new Set(
        operations.flatMap(
          (operation) => operation.tags || EMPTY_ARRAY
        )
      ),
    ].sort((left, right) => left.localeCompare(right)),
    [operations]
  );

  const filteredOperations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return operations.filter((operation) => {
      const matchesSearch =
        !query ||
        [
          operation.path,
          operation.method,
          operation.summary,
          operation.operationId,
          ...(operation.tags || EMPTY_ARRAY),
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query)
          );

      const matchesMethod =
        methodFilter === "all" ||
        operation.method.toUpperCase() === methodFilter;

      const matchesTag =
        tagFilter === "all" ||
        operation.tags?.includes(tagFilter);

      return matchesSearch && matchesMethod && matchesTag;
    });
  }, [operations, search, methodFilter, tagFilter]);

  const operationGroups = useMemo(
    () => filteredOperations.reduce((groups, operation) => {
      const group = operation.tags?.[0] || "Untagged";

      if (!groups[group]) {
        groups[group] = [];
      }

      groups[group].push(operation);

      return groups;
    }, {}),
    [filteredOperations]
  );

  const methodCounts = useMemo(
    () => operations.reduce((counts, operation) => {
      const method = operation.method.toUpperCase();

      counts[method] = (counts[method] || 0) + 1;

      return counts;
    }, {}),
    [operations]
  );

  const clearFilters = () => {
    setSearch("");
    setMethodFilter("all");
    setTagFilter("all");
  };

  if (projectQuery.isPending || operationsQuery.isPending) {
    return (
      <section className="api-explorer-page">
        <div className="explorer-page-loading">
          <span className="spinner" />
          Preparing API Explorer...
        </div>
      </section>
    );
  }

  if (projectQuery.isError) {
    return (
      <section className="api-explorer-page">
        <Link to="/projects" className="back-link">
          <ArrowLeft size={16} />
          All projects
        </Link>

        <QueryError
          error={projectQuery.error}
          onRetry={() => projectQuery.refetch()}
        />
      </section>
    );
  }

  if (operationsQuery.isError) {
    return (
      <section className="api-explorer-page">
        <Link
          to={`/projects/${encodeURIComponent(projectId)}`}
          className="back-link"
        >
          <ArrowLeft size={16} />
          Back to project
        </Link>

        <QueryError
          error={operationsQuery.error}
          onRetry={() => operationsQuery.refetch()}
        />
      </section>
    );
  }

  return (
    <section className="api-explorer-page">
      <div className="explorer-page-topline">
        <Link
          to={`/projects/${encodeURIComponent(projectId)}`}
          className="back-link"
        >
          <ArrowLeft size={16} />
          {projectQuery.data.name}
        </Link>

        <span className="explorer-breadcrumb-current">
          API Explorer
        </span>
      </div>

      <header className="explorer-page-header">
        <div className="explorer-page-title">
          <div className="explorer-page-icon">
            <Code2 size={23} />
          </div>

          <div>
            <span className="eyebrow">
              SPECIFICATION WORKSPACE
            </span>

            <h1>API Explorer</h1>

            <p>
              Explore operations, request and response
              contracts, and reusable components.
            </p>
          </div>
        </div>

        <div className="explorer-version-meta">
          <span className="explorer-version-label">
            {specification?.label || "Specification"}
          </span>

          <span>
            OpenAPI {specification?.openapiVersion || "—"}
          </span>
        </div>
      </header>

      <WarningBanner specification={specification} />

      <section className="explorer-overview-strip">
        <div>
          <span>Operations</span>
          <strong>{operations.length}</strong>
        </div>

        <div>
          <span>Schemas</span>
          <strong>{schemas.length}</strong>
        </div>

        <div>
          <span>Component categories</span>
          <strong>{componentCategories.length}</strong>
        </div>

        <div>
          <span>Uploaded</span>
          <strong>
            {formatDate(specification?.createdAt)}
          </strong>
        </div>

        <div className="explorer-overview-status">
          <CoverageBadge
            status={specification?.explorerCompleteness}
          />
        </div>
      </section>

      <div className="explorer-workspace">
        <div className="explorer-workspace-toolbar">
          <div
            className="explorer-tabs"
            role="tablist"
            aria-label="Explorer views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "operations"}
              className={
                activeTab === "operations" ? "is-active" : ""
              }
              onClick={() => setActiveTab("operations")}
            >
              <Code2 size={15} />
              Operations
              <span>{operations.length}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "components"}
              className={
                activeTab === "components" ? "is-active" : ""
              }
              onClick={() => setActiveTab("components")}
            >
              <Braces size={15} />
              Components
              <span>{schemas.length}</span>
            </button>
          </div>

          {activeTab === "operations" && (
            <div className="explorer-toolbar-count">
              <span className="explorer-live-dot" />
              {filteredOperations.length} of {operations.length} operations
            </div>
          )}
        </div>

        {activeTab === "operations" ? (
          <div className="explorer-operations-layout">
            <aside className="explorer-operations-sidebar">
              <div className="explorer-sidebar-heading">
                <div>
                  <span className="eyebrow">
                    ENDPOINT CATALOG
                  </span>

                  <h2>Operations</h2>
                </div>

                <span>{operations.length}</span>
              </div>

              <div className="explorer-search-field">
                <Search size={15} />

                <input
                  type="search"
                  placeholder="Search path, tag or operation..."
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  aria-label="Search operations"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="explorer-filter-row">
                <label htmlFor="operation-method-filter">
                  <Filter size={13} />
                  Method
                </label>

                <select
                  id="operation-method-filter"
                  value={methodFilter}
                  onChange={(event) =>
                    setMethodFilter(event.target.value)
                  }
                >
                  <option value="all">All methods</option>

                  {methodOptions.map((method) => (
                    <option value={method} key={method}>
                      {method} ({methodCounts[method] || 0})
                    </option>
                  ))}
                </select>
              </div>

              <div className="explorer-filter-row">
                <label htmlFor="operation-tag-filter">
                  <SlidersHorizontal size={13} />
                  Tag
                </label>

                <select
                  id="operation-tag-filter"
                  value={tagFilter}
                  onChange={(event) =>
                    setTagFilter(event.target.value)
                  }
                >
                  <option value="all">All tags</option>

                  {tagOptions.map((tag) => (
                    <option value={tag} key={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>

              {(search ||
                methodFilter !== "all" ||
                tagFilter !== "all") && (
                <button
                  type="button"
                  className="explorer-clear-filters"
                  onClick={clearFilters}
                >
                  <X size={13} />
                  Clear filters
                </button>
              )}

              <div className="explorer-operation-groups">
                {filteredOperations.length === 0 ? (
                  <div className="explorer-list-empty">
                    <Search size={19} />
                    <strong>No operations found</strong>
                    <span>
                      Try changing the search or filters.
                    </span>
                  </div>
                ) : (
                  Object.entries(operationGroups).map(
                    ([group, items]) => (
                      <section
                        className="explorer-operation-group"
                        key={group}
                      >
                        <div className="explorer-group-heading">
                          <span>{group}</span>
                          <span>{items.length}</span>
                        </div>

                        {items.map((operation) => (
                          <OperationListItem
                            key={operation.operationKey}
                            operation={operation}
                            isActive={
                              operation.operationKey ===
                              activeOperationKey
                            }
                            onClick={() => {
                              setSelectedOperationKey(
                                operation.operationKey
                              );
                            }}
                          />
                        ))}
                      </section>
                    )
                  )
                )}
              </div>
            </aside>

            <main className="explorer-operation-main">
              {operations.length === 0 ? (
                <div className="explorer-detail-empty">
                  <div className="explorer-detail-empty-icon">
                    <Code2 size={24} />
                  </div>

                  <h3>No indexed operations</h3>

                  <p>
                    This specification does not contain any
                    operations represented by the current Explorer.
                  </p>
                </div>
              ) : (
                <OperationDetails
                  specification={specification}
                  specVersionId={specVersionId}
                  operationQuery={operationQuery}
                />
              )}
            </main>
          </div>
        ) : (
          <ComponentsBrowser
            specVersionId={specVersionId}
            componentCategories={componentCategories}
          />
        )}
      </div>
    </section>
  );
};

export default ApiExplorerPage;
