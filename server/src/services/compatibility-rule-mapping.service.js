const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const severityOf = (change) => {
  if (change?.classification) return change.classification;
  if (change?.severity === "BREAKING") return "BREAKING";
  if (change?.severity === "NON_BREAKING") return "NON_BREAKING";
  return "INFORMATIONAL";
};

const startsWithField = (field, prefix) =>
  typeof field === "string" &&
  (field === prefix || field.startsWith(`${prefix}.`));

const mapSchemaFinding = (change) => {
  const field = String(change.field ?? "");
  const classification = severityOf(change);
  const isParameter = startsWithField(field, "parameters");
  const isRequest = startsWithField(field, "requestBody");
  const isResponse = startsWithField(field, "responses");

  if (!isParameter && !isRequest && !isResponse) return null;

  if (isParameter) {
    switch (change.changeType) {
      case "SCHEMA_TYPE_CHANGED":
      case "SCHEMA_CONSTRAINT_CHANGED":
      case "SCHEMA_BOOLEAN_CHANGED":
      case "SCHEMA_ADDITIONAL_PROPERTIES_CHANGED":
        return classification === "BREAKING"
          ? { ruleId: "PAR-004", classification: "BREAKING" }
          : classification === "NON_BREAKING"
            ? { ruleId: "PAR-005", classification: "NON_BREAKING" }
            : { ruleId: "SCH-001", classification: "UNSUPPORTED" };

      case "SCHEMA_ENUM_CHANGED":
      case "SCHEMA_CONST_CHANGED":
        return classification === "BREAKING"
          ? { ruleId: "PAR-008", classification: "BREAKING" }
          : classification === "NON_BREAKING"
            ? { ruleId: "PAR-009", classification: "NON_BREAKING" }
            : { ruleId: "SCH-001", classification: "UNSUPPORTED" };

      case "SCHEMA_PROPERTY_ADDED":
      case "SCHEMA_PROPERTY_REMOVED":
        return classification === "BREAKING"
          ? { ruleId: "PAR-004", classification: "BREAKING" }
          : classification === "NON_BREAKING"
            ? { ruleId: "PAR-005", classification: "NON_BREAKING" }
            : { ruleId: "SCH-001", classification: "UNSUPPORTED" };

      default:
        break;
    }
  }

  if (isRequest) {
    switch (change.changeType) {
      case "SCHEMA_REQUIRED_ADDED":
        return { ruleId: "REQ-005", classification: "BREAKING" };
      case "SCHEMA_REQUIRED_REMOVED":
        return { ruleId: "REQ-006", classification: "NON_BREAKING" };
      case "SCHEMA_PROPERTY_REMOVED":
        return {
          ruleId: "REQ-007",
          classification: "POTENTIALLY_BREAKING",
        };
      case "SCHEMA_PROPERTY_ADDED":
        return classification === "BREAKING"
          ? { ruleId: "REQ-005", classification: "BREAKING" }
          : { ruleId: "REQ-011", classification: "NON_BREAKING" };
      case "SCHEMA_TYPE_CHANGED":
        return classification === "BREAKING"
          ? { ruleId: "REQ-008", classification: "BREAKING" }
          : classification === "NON_BREAKING"
            ? { ruleId: "REQ-011", classification: "NON_BREAKING" }
            : { ruleId: "SCH-001", classification: "UNSUPPORTED" };
      case "SCHEMA_ENUM_CHANGED":
      case "SCHEMA_CONST_CHANGED":
        return classification === "BREAKING"
          ? { ruleId: "REQ-009", classification: "BREAKING" }
          : classification === "NON_BREAKING"
            ? { ruleId: "REQ-011", classification: "NON_BREAKING" }
            : { ruleId: "SCH-001", classification: "UNSUPPORTED" };
      case "SCHEMA_CONSTRAINT_CHANGED":
      case "SCHEMA_ADDITIONAL_PROPERTIES_CHANGED":
      case "SCHEMA_BOOLEAN_CHANGED":
        return classification === "BREAKING"
          ? { ruleId: "REQ-010", classification: "BREAKING" }
          : classification === "NON_BREAKING"
            ? { ruleId: "REQ-011", classification: "NON_BREAKING" }
            : { ruleId: "SCH-001", classification: "UNSUPPORTED" };
      case "SCHEMA_NULLABILITY_CHANGED":
        return { ruleId: "SCH-001", classification: "UNSUPPORTED" };
      default:
        break;
    }
  }

  if (isResponse) {
    switch (change.changeType) {
      case "SCHEMA_PROPERTY_REMOVED":
        return { ruleId: "RES-001", classification: "BREAKING" };
      case "SCHEMA_REQUIRED_REMOVED":
        return { ruleId: "RES-003", classification: "BREAKING" };
      case "SCHEMA_REQUIRED_ADDED":
        return { ruleId: "RES-004", classification: "NON_BREAKING" };
      case "SCHEMA_PROPERTY_ADDED":
        return classification === "POTENTIALLY_BREAKING"
          ? {
              ruleId: "RES-005",
              classification: "POTENTIALLY_BREAKING",
            }
          : { ruleId: "RES-005", classification: "NON_BREAKING" };
      case "SCHEMA_TYPE_CHANGED":
        return classification === "BREAKING"
          ? { ruleId: "RES-002", classification: "BREAKING" }
          : classification === "POTENTIALLY_BREAKING"
            ? {
                ruleId: "RES-009",
                classification: "POTENTIALLY_BREAKING",
              }
            : { ruleId: "RES-008", classification: "NON_BREAKING" };
      case "SCHEMA_ENUM_CHANGED":
      case "SCHEMA_CONST_CHANGED":
        return classification === "POTENTIALLY_BREAKING"
          ? {
              ruleId: "RES-006",
              classification: "POTENTIALLY_BREAKING",
            }
          : classification === "NON_BREAKING"
            ? { ruleId: "RES-007", classification: "NON_BREAKING" }
            : { ruleId: "RES-002", classification: "BREAKING" };
      case "SCHEMA_CONSTRAINT_CHANGED":
      case "SCHEMA_ADDITIONAL_PROPERTIES_CHANGED":
      case "SCHEMA_BOOLEAN_CHANGED":
        return classification === "POTENTIALLY_BREAKING"
          ? {
              ruleId: "RES-009",
              classification: "POTENTIALLY_BREAKING",
            }
          : classification === "NON_BREAKING"
            ? { ruleId: "RES-008", classification: "NON_BREAKING" }
            : classification === "BREAKING"
              ? { ruleId: "RES-002", classification: "BREAKING" }
              : { ruleId: "SCH-001", classification: "UNSUPPORTED" };
      case "SCHEMA_NULLABILITY_CHANGED":
        return change.newValue === true
          ? {
              ruleId: "RES-013",
              classification: "POTENTIALLY_BREAKING",
            }
          : { ruleId: "RES-014", classification: "NON_BREAKING" };
      default:
        break;
    }
  }

  return null;
};

const isEmptySecurity = (value) =>
  !Array.isArray(value) || value.length === 0;

const getSingleAlternativeScopes = (requirements) => {
  if (!Array.isArray(requirements) || requirements.length !== 1) return null;
  const requirement = requirements[0];
  if (!isRecord(requirement)) return null;
  return new Map(
    Object.entries(requirement).map(([scheme, scopes]) => [
      scheme,
      new Set(Array.isArray(scopes) ? scopes : []),
    ])
  );
};

const classifySecurityChange = (change) => {
  const oldValue = change.oldValue;
  const newValue = change.newValue;

  if (isEmptySecurity(oldValue) && !isEmptySecurity(newValue)) {
    return {
      ruleId: "SEC-001",
      classification: "POTENTIALLY_BREAKING",
    };
  }

  if (!isEmptySecurity(oldValue) && isEmptySecurity(newValue)) {
    return {
      ruleId: "SEC-003",
      classification: "INFORMATIONAL",
    };
  }

  const oldScopes = getSingleAlternativeScopes(oldValue);
  const newScopes = getSingleAlternativeScopes(newValue);

  if (!oldScopes || !newScopes) {
    return { ruleId: "SCH-001", classification: "UNSUPPORTED" };
  }

  let addedScopes = false;
  let removedScopes = false;

  for (const [scheme, scopes] of oldScopes) {
    const candidateScopes = newScopes.get(scheme);
    if (!candidateScopes) {
      removedScopes = true;
      continue;
    }
    for (const scope of scopes) {
      if (!candidateScopes.has(scope)) removedScopes = true;
    }
  }

  for (const [scheme, scopes] of newScopes) {
    const baselineScopes = oldScopes.get(scheme);
    if (!baselineScopes) {
      addedScopes = true;
      continue;
    }
    for (const scope of scopes) {
      if (!baselineScopes.has(scope)) addedScopes = true;
    }
  }

  if (addedScopes && !removedScopes) {
    return {
      ruleId: "SEC-002",
      classification: "POTENTIALLY_BREAKING",
    };
  }

  if (removedScopes && !addedScopes) {
    return {
      ruleId: "SEC-003",
      classification: "INFORMATIONAL",
    };
  }

  if (!addedScopes && !removedScopes) {
    return { ruleId: "SEC-003", classification: "INFORMATIONAL" };
  }

  return { ruleId: "SCH-001", classification: "UNSUPPORTED" };
};

const hasServerVariableChange = (oldServers, newServers) => {
  if (!Array.isArray(oldServers) || !Array.isArray(newServers)) return false;

  const oldByUrl = new Map(oldServers.map((server) => [server?.url, server]));
  const newByUrl = new Map(newServers.map((server) => [server?.url, server]));

  for (const [url, oldServer] of oldByUrl) {
    const newServer = newByUrl.get(url);
    if (!newServer) continue;
    if (
      JSON.stringify(oldServer?.variables ?? {}) !==
      JSON.stringify(newServer?.variables ?? {})
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Maps analyzer-level change types to the normative CG-COMPAT rules.
 * Unknown change types are conservatively represented as unsupported rather
 * than being assigned an invented compatibility classification.
 */
export const resolveCompatibilityRule = (change) => {
  if (typeof change?.ruleId === "string" && change.ruleId.trim()) {
    return {
      ruleId: change.ruleId,
      classification: change.classification ?? severityOf(change),
    };
  }

  const type = change?.changeType;
  const category = change?.category;
  const field = String(change?.field ?? "");
  const classification = severityOf(change);

  const operationRules = {
    OPERATION_REMOVED: ["OP-001", "BREAKING"],
    OPERATION_ADDED: ["OP-002", "NON_BREAKING"],
    OPERATION_PATH_CHANGED: ["OP-003", "BREAKING"],
    PATH_PARAMETER_RENAMED: ["OP-004", "POTENTIALLY_BREAKING"],
    OPERATION_ID_CHANGED: ["OP-005", "POTENTIALLY_BREAKING"],
    OPERATION_DOCUMENTATION_CHANGED: ["OP-006", "INFORMATIONAL"],
    OPERATION_DEPRECATED: ["OP-007", "INFORMATIONAL"],
    OPERATION_METHOD_CHANGED: ["OP-008", "BREAKING"],
  };

  if (operationRules[type]) {
    const [ruleId, mappedClassification] = operationRules[type];
    return { ruleId, classification: mappedClassification };
  }

  if (category === "parameter") {
    if (type === "PARAMETER_ADDED") {
      return change.newValue?.required === true
        ? { ruleId: "PAR-001", classification: "BREAKING" }
        : { ruleId: "PAR-002", classification: "NON_BREAKING" };
    }

    if (type === "PARAMETER_REMOVED") {
      return {
        ruleId: "PAR-003",
        classification: "POTENTIALLY_BREAKING",
      };
    }

    if (type === "PARAMETER_REQUIRED") {
      return change.newValue === true
        ? { ruleId: "PAR-006", classification: "BREAKING" }
        : { ruleId: "PAR-007", classification: "NON_BREAKING" };
    }

    if (type === "PARAMETER_OPTIONAL") {
      return { ruleId: "PAR-007", classification: "NON_BREAKING" };
    }

    if (type === "PARAMETER_SERIALIZATION_CHANGED") {
      return {
        ruleId: "PAR-010",
        classification: "POTENTIALLY_BREAKING",
      };
    }

    if (type === "PARAMETER_DOCUMENTATION_CHANGED") {
      return { ruleId: "PAR-011", classification: "INFORMATIONAL" };
    }

    if (type === "PARAMETER_LOCATION_CHANGED") {
      return { ruleId: "PAR-012", classification: "BREAKING" };
    }

    if (type === "PARAMETER_SCHEMA_ADDED") {
      return { ruleId: "PAR-004", classification: "BREAKING" };
    }

    if (type === "PARAMETER_SCHEMA_REMOVED") {
      return { ruleId: "PAR-005", classification: "NON_BREAKING" };
    }
  }

  if (category === "requestBody") {
    const requestBodyRules = {
      REQUEST_BODY_REQUIRED: ["REQ-001", "BREAKING"],
      REQUEST_BODY_OPTIONAL: ["REQ-002", "NON_BREAKING"],
      MEDIA_TYPE_ADDED: ["REQ-004", "NON_BREAKING"],
      MEDIA_TYPE_COVERAGE_CHANGED: ["SCH-001", "UNSUPPORTED"],
      MEDIA_TYPE_EXAMPLES_CHANGED: ["SCH-001", "UNSUPPORTED"],
    };

    if (type === "MEDIA_TYPE_REMOVED") {
      return classification === "BREAKING"
        ? { ruleId: "REQ-003", classification: "BREAKING" }
        : {
            ruleId: "REQ-003",
            classification: "POTENTIALLY_BREAKING",
          };
    }

    if (requestBodyRules[type]) {
      const [ruleId, mappedClassification] = requestBodyRules[type];
      return { ruleId, classification: mappedClassification };
    }
  }

  if (category === "response") {
    const responseRules = {
      RESPONSE_REMOVED: ["RES-011", "POTENTIALLY_BREAKING"],
      RESPONSE_STATUS_COVERAGE_CHANGED: ["SCH-001", "UNSUPPORTED"],
      RESPONSE_HEADER_REMOVED: ["SCH-001", "UNSUPPORTED"],
      RESPONSE_HEADER_ADDED: ["SCH-001", "UNSUPPORTED"],
      RESPONSE_ADDED: ["SCH-001", "UNSUPPORTED"],
      MEDIA_TYPE_EXAMPLES_CHANGED: ["RES-012", "INFORMATIONAL"],

      RESPONSE_DOCUMENTATION_CHANGED: ["RES-012", "INFORMATIONAL"],
      RESPONSE_HEADER_SCHEMA_ADDED: ["SCH-001", "UNSUPPORTED"],
      RESPONSE_HEADER_SCHEMA_REMOVED: ["SCH-001", "UNSUPPORTED"],
    };

    if (responseRules[type]) {
      const [ruleId, mappedClassification] = responseRules[type];
      return { ruleId, classification: mappedClassification };
    }
  }

  if (type === "MEDIA_TYPE_REMOVED") {
    if (startsWithField(field, "requestBody")) {
      return { ruleId: "REQ-003", classification: "BREAKING" };
    }
    if (startsWithField(field, "responses")) {
      return {
        ruleId: "RES-010",
        classification: "POTENTIALLY_BREAKING",
      };
    }
  }

  if (type === "MEDIA_TYPE_ADDED") {
    if (startsWithField(field, "requestBody")) {
      return { ruleId: "REQ-004", classification: "NON_BREAKING" };
    }
    if (startsWithField(field, "responses")) {
      return { ruleId: "SCH-001", classification: "UNSUPPORTED" };
    }
  }

  if (type === "MEDIA_TYPE_SCHEMA_ADDED") {
    if (startsWithField(field, "requestBody")) {
      return { ruleId: "REQ-010", classification: "BREAKING" };
    }
    if (startsWithField(field, "responses")) {
      return { ruleId: "RES-008", classification: "NON_BREAKING" };
    }
  }

  if (type === "MEDIA_TYPE_SCHEMA_REMOVED") {
    if (startsWithField(field, "requestBody")) {
      return { ruleId: "REQ-011", classification: "NON_BREAKING" };
    }
    if (startsWithField(field, "responses")) {
      return {
        ruleId: "RES-009",
        classification: "POTENTIALLY_BREAKING",
      };
    }
  }

  if (type === "REQUEST_ENCODING_CHANGED") {
    return {
      ruleId: "REQ-012",
      classification: "POTENTIALLY_BREAKING",
    };
  }

  if (type === "MEDIA_TYPE_COVERAGE_CHANGED") {
    return { ruleId: "SCH-001", classification: "UNSUPPORTED" };
  }

  if (type === "MEDIA_TYPE_EXAMPLES_CHANGED") {
    return { ruleId: "SCH-001", classification: "UNSUPPORTED" };
  }

  const schemaPolicy = mapSchemaFinding(change);
  if (schemaPolicy) return schemaPolicy;

  if (type === "SECURITY_REQUIREMENTS_CHANGED") {
    return classifySecurityChange(change);
  }

  if (
    type === "SECURITY_SCHEME_CHANGED" ||
    type === "SECURITY_SCHEME_ADDED" ||
    type === "SECURITY_SCHEME_REMOVED"
  ) {
    return { ruleId: "SCH-001", classification: "UNSUPPORTED" };
  }

  if (type === "SERVER_CONFIGURATION_CHANGED") {
    return hasServerVariableChange(change.oldValue, change.newValue)
      ? { ruleId: "SRV-002", classification: "POTENTIALLY_BREAKING" }
      : { ruleId: "SRV-001", classification: "INFORMATIONAL" };
  }

  if (type === "OPERATION_DOCUMENTATION_CHANGED") {
    return { ruleId: "OP-006", classification: "INFORMATIONAL" };
  }

  // Preserve compatibility with legacy callers that construct a finding
  // without an analyzer category. Actual analyzer findings always include a
  // category and therefore must map to a documented rule or SCH-001.
  if (!category) {
    return {
      ruleId: change?.ruleId ?? null,
      classification: severityOf(change),
    };
  }

  // Any remaining categorized finding lacks an explicit normative v1 rule.
  // Do not accidentally persist it as safe merely because legacy severity is INFO.
  return {
    ruleId: "SCH-001",
    classification: "UNSUPPORTED",
  };
};

export const sortCompatibilityFindings = (changes = []) => {
  const severityRank = {
    BREAKING: 0,
    POTENTIALLY_BREAKING: 1,
    NON_BREAKING: 2,
    INFORMATIONAL: 3,
    UNSUPPORTED: 4,
  };

  return [...changes].sort((left, right) => {
    const byPath = String(left.path ?? "").localeCompare(
      String(right.path ?? "")
    );
    if (byPath !== 0) return byPath;

    const byMethod = String(left.method ?? "").localeCompare(
      String(right.method ?? "")
    );
    if (byMethod !== 0) return byMethod;

    const bySeverity =
      (severityRank[left.classification] ?? 99) -
      (severityRank[right.classification] ?? 99);
    if (bySeverity !== 0) return bySeverity;

    const byPointer = String(left.jsonPointer ?? "").localeCompare(
      String(right.jsonPointer ?? "")
    );
    if (byPointer !== 0) return byPointer;

    const byRule = String(left.ruleId ?? "").localeCompare(
      String(right.ruleId ?? "")
    );
    if (byRule !== 0) return byRule;

    return String(left.changeId ?? "").localeCompare(
      String(right.changeId ?? "")
    );
  });
};

export const isRecordValue = isRecord;