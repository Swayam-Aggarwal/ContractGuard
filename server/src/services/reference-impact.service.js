
import createOperationIndex from "./openapi-operation-index.service.js";
import createOpenApiReferenceService from "./openapi-reference.service.js";
import { matchOpenApiOperations } from "./openapi-path-normalization.service.js";

const MAX_REFERENCE_NODES_PER_SCOPE = 50000;
const MAX_REFERENCE_DEPTH = 40;
const MAX_IMPACT_WARNINGS = 100;
const MAX_REFERENCE_WARNINGS = 100;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isSchemaPointer = (pointer) =>
  typeof pointer === "string" && /^#\/components\/schemas\//u.test(pointer);

const addToMap = (map, key, value) => {
  const values = map.get(key) ?? new Set();
  values.add(value);
  map.set(key, values);
};

const createWarning = (field, message) => ({
  field: String(field || "reference-impact").slice(0, 500),
  message: String(message || "Reference impact could not be resolved.").slice(0, 1000),
});

const scanSchemaReferences = (roots, references, operationKey) => {
  const schemaPointers = new Set();
  const warnings = [];
  const visitedObjects = new WeakSet();
  const visitedTargets = new Set();
  let visitedNodes = 0;

  const addWarning = (field, message) => {
    if (warnings.length < 10) {
      warnings.push(createWarning(field, message));
    }
  };

  const visit = (value, pointer, depth = 0) => {
    visitedNodes += 1;

    if (visitedNodes > MAX_REFERENCE_NODES_PER_SCOPE) {
      addWarning(
        pointer || operationKey,
        "The operation reference graph exceeded the bounded impact-analysis node limit."
      );
      return;
    }

    if (depth > MAX_REFERENCE_DEPTH) {
      addWarning(
        pointer || operationKey,
        "The operation reference graph exceeded the bounded impact-analysis depth limit."
      );
      return;
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        visit(value[index], `${pointer || "document"}/${index}`, depth + 1);
      }
      return;
    }

    if (!isRecord(value)) return;

    if (typeof value.$ref === "string") {
      if (!value.$ref.startsWith("#")) {
        addWarning(
          pointer || operationKey,
          "An external reference prevents exhaustive shared-schema impact analysis; external resources were not fetched."
        );
      } else {
        try {
          const result = references.resolveReferenceChain(value.$ref);

          for (const entry of result.chain ?? []) {
            if (isSchemaPointer(entry.targetPointer)) {
              schemaPointers.add(entry.targetPointer);
            }
          }

          if (isSchemaPointer(result.targetPointer)) {
            schemaPointers.add(result.targetPointer);
          }

          if (result.circular) {
            addWarning(
              pointer || operationKey,
              "A circular reference prevents exhaustive shared-schema impact analysis."
            );
          } else if (
            result.targetPointer &&
            !visitedTargets.has(result.targetPointer)
          ) {
            visitedTargets.add(result.targetPointer);
            visit(result.value, result.targetPointer, depth + 1);
          }
        } catch {
          addWarning(
            pointer || operationKey,
            "An internal reference could not be resolved during shared-schema impact analysis."
          );
        }
      }
    }

    if (visitedObjects.has(value)) return;
    visitedObjects.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref") continue;
      visit(child, `${pointer || "document"}/${key}`, depth + 1);
    }
  };

  for (const root of roots) {
    if (root.value !== undefined && root.value !== null) {
      visit(root.value, root.pointer || operationKey);
    }
  }

  return { schemaPointers, warnings };
};

const createDocumentImpactIndex = (document) => {
  const operations = createOperationIndex(document);
  const references = createOpenApiReferenceService(document);
  const operationScopes = new Map();
  const schemaToOperations = new Map();
  const incompleteScopes = new Set();
  const warnings = [];

  for (const operation of operations) {
    let operationObject;
    let pathItemObject;

    try {
      operationObject = references.getValueAtPointer(
        operation.sourcePointer
      ).value;
      pathItemObject = references.getValueAtPointer(
        operation.pathItemPointer
      ).value;
    } catch {
      warnings.push(createWarning(
        operation.sourcePointer,
        "The operation source pointer could not be resolved for shared-schema impact analysis."
      ));
      incompleteScopes.add("parameters");
      incompleteScopes.add("requestBody");
      incompleteScopes.add("responses");
      continue;
    }

    if (!isRecord(operationObject) || !isRecord(pathItemObject)) {
      warnings.push(createWarning(
        operation.sourcePointer,
        "The operation could not be loaded for shared-schema impact analysis."
      ));
      incompleteScopes.add("parameters");
      incompleteScopes.add("requestBody");
      incompleteScopes.add("responses");
      continue;
    }

    const scopes = {
      parameters: [
        { value: pathItemObject.parameters ?? [], pointer: `${operation.pathItemPointer}/parameters` },
        { value: operationObject.parameters ?? [], pointer: `${operation.sourcePointer}/parameters` },
      ],
      requestBody: [
        { value: operationObject.requestBody, pointer: `${operation.sourcePointer}/requestBody` },
      ],
      responses: [
        { value: operationObject.responses ?? {}, pointer: `${operation.sourcePointer}/responses` },
      ],
    };

    const scopeReferences = {};

    for (const [scope, roots] of Object.entries(scopes)) {
      const result = scanSchemaReferences(
        roots,
        references,
        operation.operationKey
      );

      scopeReferences[scope] = result.schemaPointers;

      if (result.warnings.length > 0) {
        incompleteScopes.add(scope);
        warnings.push(...result.warnings);
      }

      for (const pointer of result.schemaPointers) {
        addToMap(schemaToOperations, pointer, operation.operationKey);
      }
    }

    operationScopes.set(operation.operationKey, scopeReferences);
  }

  return {
    operations,
    operationScopes,
    schemaToOperations,
    incompleteScopes,
    warnings,
  };
};

const getFindingScope = (change) => {
  // Only schema-comparison findings should fan out through shared schema
  // references. Parameter metadata, response descriptions, status-code
  // changes, and request-body requiredness remain attached to their direct
  // operation and must not inherit unrelated schema references in the scope.
  if (change.category !== "schema") return null;

  const field = String(change.field ?? "");
  if (field.startsWith("parameters.")) return "parameters";
  if (field.startsWith("requestBody.")) return "requestBody";
  if (field.startsWith("responses.")) return "responses";

  return null;
};

const getRelatedOperations = (schemaPointers, schemaToOperations) => {
  const result = new Set();

  for (const [componentPointer, operationKeys] of schemaToOperations) {
    const pointerMatches = [...schemaPointers].some((findingPointer) =>
      findingPointer === componentPointer ||
      findingPointer.startsWith(`${componentPointer}/`) ||
      componentPointer.startsWith(`${findingPointer}/`)
    );

    if (!pointerMatches) continue;

    for (const operationKey of operationKeys) {
      result.add(operationKey);
    }
  }

  return result;
};

/**
 * Adds reverse-reference impact to findings without changing their rule
 * classification or stable change IDs. Candidate operations are translated
 * back to matched baseline operation keys so test-case lookup always uses
 * the comparison's baseline contract.
 */
export const addReferenceImpact = (
  analysis,
  baselineDocument,
  candidateDocument
) => {
  let baseline;
  let candidate;
  let operationMatches;

  try {
    baseline = createDocumentImpactIndex(baselineDocument);
    candidate = createDocumentImpactIndex(candidateDocument);
    operationMatches = matchOpenApiOperations(
      baseline.operations,
      candidate.operations
    );
  } catch {
    const warning = createWarning(
      "referenceImpact.index",
      "The operation index could not be completed for shared-schema impact analysis. Direct operation links were preserved, but indirect impact may be incomplete."
    );

    return {
      ...analysis,
      changes: (analysis.changes ?? []).map((change) => ({
        ...change,
        affectedOperationKeys: [...new Set([
          ...(Array.isArray(change.affectedOperationKeys)
            ? change.affectedOperationKeys
            : []),
          ...(change.operationKey ? [change.operationKey] : []),
        ].filter(Boolean))].sort(),
      })),
      warnings: [...(analysis.warnings ?? []), warning].slice(0, MAX_REFERENCE_WARNINGS),
      analysisStatus: analysis.analysisStatus === "COMPLETE"
        ? "PARTIAL"
        : analysis.analysisStatus,
    };
  }

  const candidateToBaselineKey = new Map(
    operationMatches.matches.map(({ baseline: oldOperation, candidate: newOperation }) => [
      newOperation.operationKey,
      oldOperation.operationKey,
    ])
  );
  const baselineToCandidateKey = new Map(
    operationMatches.matches.map(({ baseline: oldOperation, candidate: newOperation }) => [
      oldOperation.operationKey,
      newOperation.operationKey,
    ])
  );

  const candidateSchemaToBaselineOperations = new Map();

  for (const [pointer, operationKeys] of candidate.schemaToOperations) {
    for (const candidateKey of operationKeys) {
      const baselineKey = candidateToBaselineKey.get(candidateKey);
      if (baselineKey) {
        addToMap(candidateSchemaToBaselineOperations, pointer, baselineKey);
      }
    }
  }

  const impactWarnings = [];
  const changes = analysis.changes.map((change) => {
    const directKeys = new Set([
      ...(Array.isArray(change.affectedOperationKeys)
        ? change.affectedOperationKeys
        : []),
      ...(change.operationKey ? [change.operationKey] : []),
    ].filter(Boolean));

    const scope = getFindingScope(change);
    const baselineKey = change.operationKey;
    const candidateKey = baselineKey
      ? baselineToCandidateKey.get(baselineKey) ?? null
      : null;

    if (scope && baselineKey) {
      const baselinePointers = baseline.operationScopes.get(baselineKey)?.[scope] ?? new Set();
      const candidatePointers = candidateKey
        ? candidate.operationScopes.get(candidateKey)?.[scope] ?? new Set()
        : new Set();

      const relatedBaseline = getRelatedOperations(
        baselinePointers,
        baseline.schemaToOperations
      );
      const relatedCandidate = getRelatedOperations(
        candidatePointers,
        candidateSchemaToBaselineOperations
      );

      for (const key of relatedBaseline) directKeys.add(key);
      for (const key of relatedCandidate) directKeys.add(key);

      if (
        baseline.incompleteScopes.has(scope) ||
        candidate.incompleteScopes.has(scope)
      ) {
        impactWarnings.push(createWarning(
          `referenceImpact.${baselineKey}.${scope}`,
          "One or more operation references could not be evaluated. Affected-operation coverage may be incomplete."
        ));
      }
    }

    return {
      ...change,
      affectedOperationKeys: [...directKeys].sort(),
    };
  });

  for (const warning of [...baseline.warnings, ...candidate.warnings]) {
    if (impactWarnings.length >= MAX_IMPACT_WARNINGS) break;
    impactWarnings.push(warning);
  }

  const existingWarningKeys = new Set(
    (analysis.warnings ?? []).map((warning) => `${warning.field}\u0000${warning.message}`)
  );

  const newWarnings = impactWarnings.filter((warning) => {
    const key = `${warning.field}\u0000${warning.message}`;
    if (existingWarningKeys.has(key)) return false;
    existingWarningKeys.add(key);
    return true;
  });

  return {
    ...analysis,
    changes,
    warnings: [...(analysis.warnings ?? []), ...newWarnings].slice(0, MAX_REFERENCE_WARNINGS),
    analysisStatus:
      newWarnings.length > 0 && analysis.analysisStatus === "COMPLETE"
        ? "PARTIAL"
        : analysis.analysisStatus,
  };
};

export default addReferenceImpact;
