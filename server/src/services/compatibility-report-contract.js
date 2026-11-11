import { createHash } from "node:crypto";

import {
  resolveCompatibilityRule,
  sortCompatibilityFindings,
} from "./compatibility-rule-mapping.service.js";

export const COMPATIBILITY_RULESET_VERSION = "CG-COMPAT-1.1";

export const COMPATIBILITY_DIRECTION =
  "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER";

export const COMPATIBILITY_CLASSIFICATIONS = Object.freeze([
  "BREAKING",
  "POTENTIALLY_BREAKING",
  "NON_BREAKING",
  "INFORMATIONAL",
  "UNSUPPORTED",
]);

export const ANALYSIS_STATUSES = Object.freeze([
  "COMPLETE",
  "PARTIAL",
  "FAILED",
]);

const LEGACY_SEVERITY_CLASSIFICATIONS = Object.freeze({
  BREAKING: "BREAKING",
  NON_BREAKING: "NON_BREAKING",
  INFO: "INFORMATIONAL",
});

const CLASSIFICATION_RATIONALES = Object.freeze({
  BREAKING:
    "The candidate contract may reject baseline-valid requests or stop meeting an existing consumer expectation.",

  POTENTIALLY_BREAKING:
    "The change may affect existing consumers, but its impact depends on consumer behavior that cannot be inferred from the specification alone.",

  NON_BREAKING:
    "The candidate contract preserves the relevant baseline expectations while allowing or guaranteeing an equivalent or broader compatible behavior.",

  INFORMATIONAL:
    "The change is informational and does not, by itself, establish a structural incompatibility.",

  UNSUPPORTED:
    "The analyzer cannot fully evaluate this construct, so compatibility cannot be established for the affected behavior.",
});

export const normalizeClassification = (change) => {
  if (COMPATIBILITY_CLASSIFICATIONS.includes(change?.classification)) {
    return change.classification;
  }

  const legacyClassification =
    LEGACY_SEVERITY_CLASSIFICATIONS[change?.severity];

  if (legacyClassification) {
    return legacyClassification;
  }

  throw new TypeError(
    `A compatibility finding has an unsupported classification or severity: ${change?.classification ?? change?.severity ?? "missing"}.`
  );
};

export const getClassificationRationale = (classification) => {
  return (
    CLASSIFICATION_RATIONALES[classification] ??
    CLASSIFICATION_RATIONALES.UNSUPPORTED
  );
};

const normalizeIdentityPart = (value) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(value).trim();
};

/**
 * Creates a reproducible finding identifier from the normative rule,
 * operation, source location and field.
 *
 * No random values, timestamps, database IDs or traversal indexes are
 * part of finding identity.
 */
export const createChangeId = ({
  ruleId,
  changeType,
  operationKey,
  jsonPointer,
  field,
}) => {
  const identity = [
    normalizeIdentityPart(ruleId || `legacy:${changeType || "change"}`),
    normalizeIdentityPart(operationKey),
    normalizeIdentityPart(jsonPointer),
    normalizeIdentityPart(field),
  ];

  return createHash("sha256")
    .update(JSON.stringify(identity), "utf8")
    .digest("hex");
};

const normalizePointer = (pointer) => {
  if (typeof pointer !== "string" || !pointer.startsWith("#/")) {
    return null;
  }

  return pointer;
};

const encodePointerSegment = (segment) =>
  String(segment).replace(/~/g, "~0").replace(/\//g, "~1");

const deriveFieldPointer = (basePointer, field) => {
  const base = normalizePointer(basePointer);

  if (!base) {
    return null;
  }

  const normalizedField = String(field ?? "");

  // Effective parameters are stored in arrays and can be inherited from a
  // Path Item. The analyzer's operation pointer is the reliable source
  // location until a parameter's resolved array index is available.
  if (normalizedField.startsWith("parameters.")) {
    return base;
  }

  if (
    normalizedField === "operation" ||
    normalizedField === "documentation" ||
    normalizedField === "path" ||
    normalizedField === "method" ||
    normalizedField === "security" ||
    normalizedField === "servers" ||
    normalizedField.startsWith("pathParameters[")
  ) {
    return base;
  }

  const segments = normalizedField
    .replace(/\[(\d+)\]/gu, ".$1")
    .split(".")
    .filter(Boolean)
    .map(encodePointerSegment);

  if (segments.length === 0) {
    return base;
  }

  const suffix = `/${segments.join("/")}`;

  // createFindingContract is used both by the analyzer and when a persisted
  // report is serialized for the API. Do not append the same field twice.
  // This also keeps the operation-level pointer unchanged when the supplied
  // pointer already identifies the exact field.
  if (base.endsWith(suffix)) {
    return base;
  }

  return `${base}${suffix}`;
};

export const createFindingContract = (change) => {
  const policy = resolveCompatibilityRule(change);

  const normalizedChange = {
    ...change,
    ...policy,
  };

  const classification = normalizeClassification(normalizedChange);

  const rawBaselinePointer =
    normalizePointer(change.baselinePointer) ?? null;

  const rawCandidatePointer =
    normalizePointer(change.candidatePointer) ?? null;

  const changeType = String(change.changeType ?? "");

  const isAddition =
    /(?:^|_)(?:ADDED|ADDITION)$/u.test(changeType) ||
    (
      (change.oldValue === null || change.oldValue === undefined) &&
      change.newValue !== null &&
      change.newValue !== undefined
    );

  const isRemoval =
    /(?:^|_)(?:REMOVED|REMOVAL)$/u.test(changeType) ||
    (
      (change.newValue === null || change.newValue === undefined) &&
      change.oldValue !== null &&
      change.oldValue !== undefined
    );

  const baselinePointer = isAddition
    ? rawBaselinePointer
    : deriveFieldPointer(rawBaselinePointer, change.field) ??
      rawBaselinePointer;

  const candidatePointer = isRemoval
    ? rawCandidatePointer
    : deriveFieldPointer(rawCandidatePointer, change.field) ??
      rawCandidatePointer;

  const jsonPointer =
    normalizePointer(change.jsonPointer) ??
    (
      isAddition
        ? candidatePointer ?? baselinePointer
        : baselinePointer ?? candidatePointer
    );

  const affectedOperationKeys = Array.isArray(
    change.affectedOperationKeys
  )
    ? [...new Set(change.affectedOperationKeys.filter(Boolean))].sort()
    : change.operationKey
      ? [change.operationKey]
      : [];

  const summary = String(
    change.summary ??
      change.message ??
      change.changeType ??
      "Compatibility change"
  ).slice(0, 2000);

  const rationale = String(
    change.rationale ?? getClassificationRationale(classification)
  ).slice(0, 2000);

  const legacySeverity = {
    BREAKING: "BREAKING",
    NON_BREAKING: "NON_BREAKING",
    POTENTIALLY_BREAKING: "INFO",
    INFORMATIONAL: "INFO",
    UNSUPPORTED: "INFO",
  }[classification];

  const ruleId = policy.ruleId ?? change.ruleId ?? null;

  return {
    ...change,

    path: change.path || null,
    severity: legacySeverity,
    breaking: classification === "BREAKING",

    changeId:
      change.changeId ??
      createChangeId({
        ruleId,
        changeType: change.changeType,
        operationKey: change.operationKey,
        jsonPointer,
        field: change.field,
      }),

    ruleId,
    classification,
    affectedOperationKeys,
    baselinePointer,
    candidatePointer,
    jsonPointer,
    summary,
    rationale,
  };
};

export const createClassificationSummary = (changes) => {
  if (Array.isArray(changes)) {
    const ordered = sortCompatibilityFindings(changes);
    changes.splice(0, changes.length, ...ordered);
  }

  const counts = {
    breaking: 0,
    potentiallyBreaking: 0,
    nonBreaking: 0,
    informational: 0,
    unsupported: 0,
  };

  for (const change of changes) {
    switch (normalizeClassification(change)) {
      case "BREAKING":
        counts.breaking += 1;
        break;

      case "POTENTIALLY_BREAKING":
        counts.potentiallyBreaking += 1;
        break;

      case "NON_BREAKING":
        counts.nonBreaking += 1;
        break;

      case "INFORMATIONAL":
        counts.informational += 1;
        break;

      case "UNSUPPORTED":
        counts.unsupported += 1;
        break;

      default:
        break;
    }
  }

  return counts;
};