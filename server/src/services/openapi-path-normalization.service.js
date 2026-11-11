const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const createIdentityKey = (parts) => JSON.stringify(parts);

/**
 * Normalize an OpenAPI path template for cross-version operation matching.
 * The original path and parameter names are never modified.
 */
export const normalizeOpenApiPath = (path) => {
  const issues = [];
  const parameterNames = [];

  if (typeof path !== "string" || !path.startsWith("/")) {
    return {
      canonicalPath: typeof path === "string" ? path : "",
      pathParameterNames: parameterNames,
      pathTemplateIssues: [{
        code: "INVALID_PATH_TEMPLATE",
        message: "An OpenAPI Paths Object key must be a string beginning with '/'.",
      }],
    };
  }

  let canonicalPath = "";
  let index = 0;

  while (index < path.length) {
    const character = path[index];

    if (character === "}") {
      issues.push({
        code: "INVALID_PATH_TEMPLATE",
        message: "The path contains a closing '}' without a matching opening '{'.",
      });

      canonicalPath += character;
      index += 1;
      continue;
    }

    if (character !== "{") {
      canonicalPath += character;
      index += 1;
      continue;
    }

    const closingIndex = path.indexOf("}", index + 1);
    const nestedOpeningIndex = path.indexOf("{", index + 1);

    if (
      closingIndex === -1 ||
      (nestedOpeningIndex !== -1 && nestedOpeningIndex < closingIndex)
    ) {
      issues.push({
        code: "INVALID_PATH_TEMPLATE",
        message: "The path contains an unclosed or nested path-parameter expression.",
      });

      canonicalPath += path.slice(index);
      break;
    }

    const parameterName = path.slice(index + 1, closingIndex);

    if (parameterName.length === 0) {
      issues.push({
        code: "INVALID_PATH_TEMPLATE",
        message: "Path-parameter expressions must contain a non-empty parameter name.",
      });
    } else if (parameterNames.includes(parameterName)) {
      issues.push({
        code: "DUPLICATE_PATH_PARAMETER_NAME",
        message: `The path parameter '${parameterName}' appears more than once in the same path template.`,
      });
    }

    parameterNames.push(parameterName);
    canonicalPath += "{}";
    index = closingIndex + 1;
  }

  return {
    canonicalPath: issues.some(
      (issue) => issue.code === "INVALID_PATH_TEMPLATE"
    )
      ? path
      : canonicalPath,
    pathParameterNames: parameterNames,
    pathTemplateIssues: issues,
  };
};

/**
 * Build a stable matching identity without changing the public operationKey.
 * Standard path operations use method + canonical path. Webhooks and callbacks
 * remain in separate namespaces; callbacks also include their parent identity.
 */
export const createOperationMatchKey = (operation) => {
  if (!isRecord(operation)) {
    throw new TypeError("Operation metadata is required.");
  }

  if (operation.kind === "path") {
    return createIdentityKey([
      "path",
      operation.method,
      operation.canonicalPath ??
        normalizeOpenApiPath(operation.path).canonicalPath,
    ]);
  }

  if (operation.kind === "webhook") {
    return createIdentityKey([
      "webhook",
      operation.method,
      operation.sourceName ?? operation.path,
    ]);
  }

  if (operation.kind === "callback") {
    return createIdentityKey([
      "callback",
      operation.parentOperationMatchKey ??
        operation.parentOperationKey ??
        "",
      operation.callbackName ?? "",
      operation.method,
      operation.path,
    ]);
  }

  return createIdentityKey([
    operation.kind ?? "unknown",
    operation.method ?? "",
    operation.path ?? "",
    operation.sourcePointer ?? "",
  ]);
};

const groupBy = (items, getKey) => {
  const groups = new Map();

  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key) ?? [];

    group.push(item);
    groups.set(key, group);
  }

  return groups;
};

/**
 * Match two operation indexes in three stages:
 * 1. Exact kind + method + canonical path identity.
 * 2. Unique operationId for otherwise-unmatched ordinary path operations.
 * 3. A unique canonical path for an otherwise-unmatched method change.
 *
 * Ambiguous groups are diagnosed and excluded from add/remove findings. This
 * prevents an invalid or duplicate identity from producing fabricated diffs.
 */
export const matchOpenApiOperations = (
  baselineOperations,
  candidateOperations
) => {
  if (
    !Array.isArray(baselineOperations) ||
    !Array.isArray(candidateOperations)
  ) {
    throw new TypeError(
      "Baseline and candidate operation arrays are required."
    );
  }

  const matches = [];
  const diagnostics = [];
  const matchedBaseline = new Set();
  const matchedCandidate = new Set();
  const ambiguousBaseline = new Set();
  const ambiguousCandidate = new Set();

  const baselineGroups = groupBy(
    baselineOperations,
    createOperationMatchKey
  );

  const candidateGroups = groupBy(
    candidateOperations,
    createOperationMatchKey
  );

  const identities = new Set([
    ...baselineGroups.keys(),
    ...candidateGroups.keys(),
  ]);

  for (const identity of identities) {
    const baselineGroup = baselineGroups.get(identity) ?? [];
    const candidateGroup = candidateGroups.get(identity) ?? [];

    if (baselineGroup.length === 1 && candidateGroup.length === 1) {
      const baseline = baselineGroup[0];
      const candidate = candidateGroup[0];

      matches.push({
        baseline,
        candidate,
        matchType: "CANONICAL_IDENTITY",
      });

      matchedBaseline.add(baseline);
      matchedCandidate.add(candidate);
      continue;
    }

    if (baselineGroup.length > 1 || candidateGroup.length > 1) {
      for (const operation of baselineGroup) {
        ambiguousBaseline.add(operation);
      }

      for (const operation of candidateGroup) {
        ambiguousCandidate.add(operation);
      }

      diagnostics.push({
        code: "AMBIGUOUS_OPERATION_IDENTITY",
        field:
          baselineGroup[0]?.sourcePointer ??
          candidateGroup[0]?.sourcePointer ??
          "operations",
        message:
          "Multiple operations share the same canonical identity. They were excluded from automatic matching and add/remove findings.",
        baselineOperations: baselineGroup,
        candidateOperations: candidateGroup,
      });
    }
  }

  const baselineOperationIdGroups = groupBy(
    baselineOperations.filter((operation) => operation.operationId),
    (operation) => operation.operationId
  );

  const candidateOperationIdGroups = groupBy(
    candidateOperations.filter((operation) => operation.operationId),
    (operation) => operation.operationId
  );

  const duplicateOperationIds = new Set();

  for (const [operationId, group] of baselineOperationIdGroups) {
    if (group.length > 1) {
      duplicateOperationIds.add(operationId);

      diagnostics.push({
        code: "DUPLICATE_OPERATION_ID",
        field: group[0].sourcePointer,
        message: `The baseline document uses operationId '${operationId}' more than once. It cannot be used as a secondary matching key.`,
        baselineOperations: group,
        candidateOperations: [],
      });
    }
  }

  for (const [operationId, group] of candidateOperationIdGroups) {
    if (group.length > 1) {
      duplicateOperationIds.add(operationId);

      diagnostics.push({
        code: "DUPLICATE_OPERATION_ID",
        field: group[0].sourcePointer,
        message: `The candidate document uses operationId '${operationId}' more than once. It cannot be used as a secondary matching key.`,
        baselineOperations: [],
        candidateOperations: group,
      });
    }
  }

  // If an ID is duplicated on either side, every otherwise-unmatched
  // operation carrying that ID on either side is ambiguous. Do not convert
  // that uncertainty into false operation-added/operation-removed findings.
  for (const operationId of duplicateOperationIds) {
    for (const operation of baselineOperationIdGroups.get(operationId) ?? []) {
      if (!matchedBaseline.has(operation)) {
        ambiguousBaseline.add(operation);
      }
    }

    for (const operation of candidateOperationIdGroups.get(operationId) ?? []) {
      if (!matchedCandidate.has(operation)) {
        ambiguousCandidate.add(operation);
      }
    }
  }

  const unmatchedBaselineForSecondary = baselineOperations.filter(
    (operation) =>
      !matchedBaseline.has(operation) &&
      !ambiguousBaseline.has(operation) &&
      operation.kind === "path" &&
      typeof operation.operationId === "string" &&
      operation.operationId.length > 0 &&
      !duplicateOperationIds.has(operation.operationId)
  );

  const unmatchedCandidateForSecondary = candidateOperations.filter(
    (operation) =>
      !matchedCandidate.has(operation) &&
      !ambiguousCandidate.has(operation) &&
      operation.kind === "path" &&
      typeof operation.operationId === "string" &&
      operation.operationId.length > 0 &&
      !duplicateOperationIds.has(operation.operationId)
  );

  const baselineByOperationId = groupBy(
    unmatchedBaselineForSecondary,
    (operation) => operation.operationId
  );

  const candidateByOperationId = groupBy(
    unmatchedCandidateForSecondary,
    (operation) => operation.operationId
  );

  for (const [operationId, baselineGroup] of baselineByOperationId) {
    const candidateGroup = candidateByOperationId.get(operationId) ?? [];

    if (baselineGroup.length !== 1 || candidateGroup.length !== 1) {
      if (baselineGroup.length > 1 || candidateGroup.length > 1) {
        for (const operation of baselineGroup) {
          ambiguousBaseline.add(operation);
        }

        for (const operation of candidateGroup) {
          ambiguousCandidate.add(operation);
        }

        diagnostics.push({
          code: "AMBIGUOUS_OPERATION_ID_MATCH",
          field:
            baselineGroup[0]?.sourcePointer ??
            candidateGroup[0]?.sourcePointer ??
            "operationId",
          message: `operationId '${operationId}' does not identify one unique unmatched operation on each side.`,
          baselineOperations: baselineGroup,
          candidateOperations: candidateGroup,
        });
      }

      continue;
    }

    const baseline = baselineGroup[0];
    const candidate = candidateGroup[0];

    matches.push({
      baseline,
      candidate,
      matchType: "OPERATION_ID",
    });

    matchedBaseline.add(baseline);
    matchedCandidate.add(candidate);
  }

  // A unique canonical path can identify an HTTP-method change even when
  // neither document supplies operationId. This fallback is intentionally
  // limited to ordinary path operations and only pairs one remaining
  // operation on each side. Multiple candidates are reported as ambiguous.
  const getCanonicalPath = (operation) =>
    operation.canonicalPath ??
    normalizeOpenApiPath(operation.path).canonicalPath;

  const remainingBaselineByPath = groupBy(
    baselineOperations.filter(
      (operation) =>
        operation.kind === "path" &&
        !matchedBaseline.has(operation) &&
        !ambiguousBaseline.has(operation)
    ),
    getCanonicalPath
  );

  const remainingCandidateByPath = groupBy(
    candidateOperations.filter(
      (operation) =>
        operation.kind === "path" &&
        !matchedCandidate.has(operation) &&
        !ambiguousCandidate.has(operation)
    ),
    getCanonicalPath
  );

  for (const [canonicalPath, baselineGroup] of remainingBaselineByPath) {
    const candidateGroup = remainingCandidateByPath.get(canonicalPath) ?? [];

    if (baselineGroup.length === 1 && candidateGroup.length === 1) {
      const baseline = baselineGroup[0];
      const candidate = candidateGroup[0];

      if (baseline.method === candidate.method) {
        continue;
      }

      matches.push({
        baseline,
        candidate,
        matchType: "CANONICAL_PATH_METHOD_CHANGE",
      });

      matchedBaseline.add(baseline);
      matchedCandidate.add(candidate);
      continue;
    }

    if (
      baselineGroup.length > 0 &&
      candidateGroup.length > 0 &&
      (baselineGroup.length > 1 || candidateGroup.length > 1)
    ) {
      for (const operation of baselineGroup) {
        ambiguousBaseline.add(operation);
      }

      for (const operation of candidateGroup) {
        ambiguousCandidate.add(operation);
      }

      diagnostics.push({
        code: "AMBIGUOUS_PATH_METHOD_CHANGE",
        field:
          baselineGroup[0]?.sourcePointer ??
          candidateGroup[0]?.sourcePointer ??
          canonicalPath,
        message:
          "Multiple unmatched operations share the same canonical path. The analyzer cannot identify which operation changed its HTTP method, so these operations were excluded from automatic add/remove findings.",
        baselineOperations: baselineGroup,
        candidateOperations: candidateGroup,
      });
    }
  }

  return {
    matches,

    unmatchedBaseline: baselineOperations.filter(
      (operation) =>
        !matchedBaseline.has(operation) &&
        !ambiguousBaseline.has(operation)
    ),

    unmatchedCandidate: candidateOperations.filter(
      (operation) =>
        !matchedCandidate.has(operation) &&
        !ambiguousCandidate.has(operation)
    ),

    ambiguousBaseline: [...ambiguousBaseline],
    ambiguousCandidate: [...ambiguousCandidate],
    diagnostics,
  };
};