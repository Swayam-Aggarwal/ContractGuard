
import { useMemo, useState } from "react";

import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  CircleAlert,
  Link2,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import {
  useSpecificationReference,
} from "../features/specifications/specifications.js";

import "./ReferenceNavigator.css";

const MAX_REFERENCE_COUNT = 50;
const MAX_SCAN_DEPTH = 40;
const MAX_SCAN_NODES = 10000;

const IGNORED_KEYS = new Set([
  "example",
  "examples",
  "default",
  "enum",
  "const",
  "externalValue",
]);

const EMPTY_SCAN = {
  references: [],
  truncated: false,
  scannedNodes: 0,
};

const isRecord = (value) => (
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value)
);

const isInternalReference = (reference) => (
  typeof reference === "string" &&
  (reference === "#" || reference.startsWith("#/"))
);

const appendJsonPointer = (pointer, segment) => {
  const base = pointer || "#";

  const encodedSegment = String(segment)
    .replace(/~/gu, "~0")
    .replace(/\//gu, "~1");

  return `${base}/${encodedSegment}`;
};

const addReference = (
  groups,
  reference,
  sourcePointer,
  label
) => {
  if (
    typeof reference !== "string" ||
    !reference.trim()
  ) {
    return false;
  }

  let group = groups.get(reference);

  if (!group) {
    if (groups.size >= MAX_REFERENCE_COUNT) {
      return true;
    }

    group = {
      reference,
      sources: new Map(),
    };

    groups.set(reference, group);
  }

  const pointer = sourcePointer || "#";

  let source = group.sources.get(pointer);

  if (!source) {
    source = {
      pointer,
      labels: new Set(),
    };

    group.sources.set(pointer, source);
  }

  if (label) {
    source.labels.add(label);
  }

  return false;
};

const collectReferences = (roots = []) => {
  const groups = new Map();

  let scannedNodes = 0;
  let truncated = false;

  for (const root of roots) {
    if (
      !root ||
      !Object.hasOwn(root, "value") ||
      root.value === null ||
      typeof root.value !== "object"
    ) {
      continue;
    }

    const visitedObjects = new WeakSet();

    const visit = (value, pointer, depth) => {
      if (
        value === null ||
        typeof value !== "object"
      ) {
        return;
      }

      if (
        depth > MAX_SCAN_DEPTH ||
        scannedNodes >= MAX_SCAN_NODES
      ) {
        truncated = true;
        return;
      }

      if (visitedObjects.has(value)) {
        return;
      }

      visitedObjects.add(value);
      scannedNodes += 1;

      if (
        isRecord(value) &&
        typeof value.$ref === "string"
      ) {
        const exceeded = addReference(
          groups,
          value.$ref,
          pointer,
          root.label || "Specification definition"
        );

        if (exceeded) {
          truncated = true;
        }
      }

      const entries = Array.isArray(value)
        ? value.map((item, index) => [
            String(index),
            item,
          ])
        : Object.entries(value);

      for (const [key, child] of entries) {
        if (
          key === "$ref" ||
          IGNORED_KEYS.has(key) ||
          (typeof key === "string" && key.startsWith("x-"))
        ) {
          continue;
        }

        if (scannedNodes >= MAX_SCAN_NODES) {
          truncated = true;
          break;
        }

        visit(
          child,
          appendJsonPointer(pointer, key),
          depth + 1
        );
      }
    };

    visit(
      root.value,
      root.pointer || "#",
      0
    );
  }

  return {
    references: [...groups.values()].map((group) => ({
      reference: group.reference,
      sources: [...group.sources.values()].map((source) => ({
        pointer: source.pointer,
        labels: [...source.labels],
      })),
    })),
    truncated,
    scannedNodes,
  };
};

const collectExplicitReferences = (items = []) => {
  const groups = new Map();

  let truncated = false;

  for (const item of items) {
    if (!item || typeof item.reference !== "string") {
      continue;
    }

    if (
      addReference(
        groups,
        item.reference,
        item.sourcePointer || "#",
        item.label || "Explorer reference"
      )
    ) {
      truncated = true;
    }
  }

  return {
    references: [...groups.values()].map((group) => ({
      reference: group.reference,
      sources: [...group.sources.values()].map((source) => ({
        pointer: source.pointer,
        labels: [...source.labels],
      })),
    })),
    truncated,
    scannedNodes: 0,
  };
};

const mergeReferenceScans = (...scans) => {
  const groups = new Map();

  let truncated = false;

  for (const scan of scans) {
    if (!scan) {
      continue;
    }

    truncated ||= scan.truncated;

    for (const item of scan.references || []) {
      let group = groups.get(item.reference);

      if (!group) {
        if (groups.size >= MAX_REFERENCE_COUNT) {
          truncated = true;
          continue;
        }

        group = {
          reference: item.reference,
          sources: new Map(),
        };

        groups.set(item.reference, group);
      }

      for (const source of item.sources || []) {
        const pointer = source.pointer || "#";

        let existingSource = group.sources.get(pointer);

        if (!existingSource) {
          existingSource = {
            pointer,
            labels: new Set(),
          };

          group.sources.set(pointer, existingSource);
        }

        for (const label of source.labels || []) {
          existingSource.labels.add(label);
        }
      }
    }
  }

  const references = [...groups.values()].map((group) => ({
    reference: group.reference,
    sources: [...group.sources.values()].map((source) => ({
      pointer: source.pointer,
      labels: [...source.labels],
    })),
  }));

  return {
    references,
    truncated,
    occurrenceCount: references.reduce(
      (total, item) => total + item.sources.length,
      0
    ),
  };
};

const formatJson = (value) => {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
};

const ReferenceResult = ({ query }) => {
  if (query.isPending) {
    return (
      <div
        className="reference-navigator-loading"
        role="status"
      >
        <LoaderCircle size={17} />
        Resolving internal reference...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        className="reference-navigator-error"
        role="alert"
      >
        <AlertCircle size={17} />

        <div>
          <strong>Reference resolution failed</strong>

          <p>
            {query.error?.details?.[0]?.message ||
              query.error?.message ||
              "The requested reference could not be resolved."}
          </p>

          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RotateCcw size={13} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const result = query.data;

  if (!result) {
    return null;
  }

  return (
    <div className="reference-navigator-result">
      <div className="reference-navigator-target">
        <span>Resolved target</span>

        <code>
          {result.targetPointer || "Root document"}
        </code>
      </div>

      {result.circular && (
        <div
          className="reference-navigator-circular"
          role="status"
        >
          <AlertCircle size={15} />

          <span>
            Circular reference detected. Automatic traversal
            has stopped safely.
          </span>
        </div>
      )}

      {result.chain?.length > 0 && (
        <div className="reference-navigator-chain">
          <strong>Resolution chain</strong>

          {result.chain.map((item, index) => (
            <div key={`${item.reference}-${index}`}>
              <code>{item.reference}</code>

              <ArrowRight size={14} />

              <code>{item.targetPointer}</code>
            </div>
          ))}
        </div>
      )}

      <div className="reference-navigator-definition">
        <strong>Resolved definition</strong>

        <pre>{formatJson(result.value)}</pre>
      </div>
    </div>
  );
};

const ReferenceNavigator = ({
  specVersionId,
  roots = [],
  explicitReferences = [],
  title = "Internal reference navigator",
}) => {
  const [selectedReference, setSelectedReference] =
    useState("");

  const initialScan = useMemo(
    () => collectReferences(roots),
    [roots]
  );

  const explicitScan = useMemo(
    () => collectExplicitReferences(explicitReferences),
    [explicitReferences]
  );

  const referenceQuery = useSpecificationReference(
    specVersionId,
    selectedReference,
    Boolean(
      specVersionId &&
      selectedReference &&
      isInternalReference(selectedReference)
    )
  );

  const nestedScan = useMemo(() => {
    if (
      !referenceQuery.isSuccess ||
      !referenceQuery.data
    ) {
      return EMPTY_SCAN;
    }

    return collectReferences([
      {
        label: "Resolved definition",
        pointer: referenceQuery.data.targetPointer || "#",
        value: referenceQuery.data.value,
      },
    ]);
  }, [
    referenceQuery.isSuccess,
    referenceQuery.data,
  ]);

  const mergedScan = useMemo(
    () => mergeReferenceScans(
      initialScan,
      explicitScan,
      nestedScan
    ),
    [
      initialScan,
      explicitScan,
      nestedScan,
    ]
  );

  const references = mergedScan.references;

  const navigableCount = references.filter(
    (item) => isInternalReference(item.reference)
  ).length;

  const unsupportedCount =
    references.length - navigableCount;

  if (references.length === 0) {
    return null;
  }

  return (
    <section
      className="reference-navigator"
      aria-label={title}
    >
      <header className="reference-navigator-header">
        <div className="reference-navigator-heading">
          <span className="reference-navigator-heading-icon">
            <Link2 size={17} />
          </span>

          <div>
            <h3>{title}</h3>

            <p>
              Navigate reusable definitions and nested schemas.
            </p>
          </div>
        </div>

        <span className="reference-navigator-count">
          {references.length}
        </span>
      </header>

      <div className="reference-navigator-summary">
        <span>
          {references.length} unique reference
          {references.length === 1 ? "" : "s"}
        </span>

        <span>
          {mergedScan.occurrenceCount} source locations
        </span>
      </div>

      <div className="reference-navigator-list">
        {references.map((item) => {
          const supported = isInternalReference(
            item.reference
          );

          const active =
            item.reference === selectedReference;

          const sourceCount = item.sources.length;

          const primarySource = item.sources[0];

          const primaryLabel =
            primarySource?.labels.join(" · ") ||
            "Specification definition";

          return (
            <article
              className={`reference-navigator-item ${
                active ? "is-active" : ""
              }`}
              key={item.reference}
            >
              <button
                type="button"
                className="reference-navigator-item-trigger"
                disabled={!supported}
                onClick={() => {
                  setSelectedReference(
                    active ? "" : item.reference
                  );
                }}
                aria-pressed={active}
                title={
                  supported
                    ? "Resolve internal reference"
                    : "External or unsupported reference. It will not be fetched."
                }
              >
                <span className="reference-navigator-item-icon">
                  {supported ? (
                    <Link2 size={15} />
                  ) : (
                    <CircleAlert size={15} />
                  )}
                </span>

                <span className="reference-navigator-item-content">
                  <code>{item.reference}</code>

                  <span>
                    {sourceCount} source location
                    {sourceCount === 1 ? "" : "s"}
                    {" · "}
                    {primaryLabel}
                  </span>

                  {sourceCount === 1 && (
                    <small>
                      {primarySource.pointer}
                    </small>
                  )}
                </span>

                {supported && (
                  <ChevronRight size={16} />
                )}
              </button>

              {sourceCount > 1 && (
                <details className="reference-navigator-sources">
                  <summary>
                    View all {sourceCount} source locations
                  </summary>

                  <div>
                    {item.sources.map((source) => (
                      <div
                        className="reference-navigator-source"
                        key={source.pointer}
                      >
                        <span>
                          {source.labels.join(" · ") ||
                            "Specification definition"}
                        </span>

                        <code>{source.pointer}</code>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {active && (
                <ReferenceResult query={referenceQuery} />
              )}
            </article>
          );
        })}
      </div>

      {mergedScan.truncated && (
        <div className="reference-navigator-limit">
          <AlertCircle size={14} />

          Reference discovery reached its safety limit.
          Additional references may exist.
        </div>
      )}

      {unsupportedCount > 0 && (
        <div className="reference-navigator-unsupported">
          <CircleAlert size={14} />

          {unsupportedCount} unsupported or external reference
          {unsupportedCount === 1 ? "" : "s"} will not be fetched.
        </div>
      )}

      <footer className="reference-navigator-footer">
        <AlertCircle size={13} />

        References are resolved against the uploaded
        specification. External URLs and uploaded server
        addresses are never contacted.
      </footer>
    </section>
  );
};

export default ReferenceNavigator;
