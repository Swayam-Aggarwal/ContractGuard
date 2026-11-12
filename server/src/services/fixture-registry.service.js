import { createHash } from "node:crypto";

export const FIXTURE_REGISTRY = Object.freeze({
  baseline: Object.freeze({
    fixtureId: "DEMO_STORE_V1",
    normalizedContentHash:
      "6759cfffbe7e63c49a09cd1e118a0c4e9c9defa4e7164b03f2785608e1ca5f14",
    openapiVersion: "3.0.3",
    apiVersion: "1.0.0",
    title: "Demo Store API",
  }),
  candidate: Object.freeze({
    fixtureId: "DEMO_STORE_V2",
    normalizedContentHash:
      "02f4a6683f985ce7e70c5520940d504871776099754a218ed1d661da40dc1306",
    openapiVersion: "3.0.3",
    apiVersion: "2.0.0",
    implementationVersion: "DEMO_STORE_V2",
    title: "Demo Store API",
  }),
  direction: "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
});

export const SUPPORTED_DEMO_STORE_OPERATIONS = Object.freeze([
  Object.freeze({ method: "GET", path: "/products" }),
  Object.freeze({ method: "GET", path: "/products/{productId}" }),
]);

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

// Normalize only an optional UTF-8 BOM and line-ending representation.
// Other content, whitespace, and the final newline remain part of the identity.
export const normalizeFixtureSource = (sourceText) => {
  if (typeof sourceText !== "string") return null;

  return sourceText
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n");
};

export const getOriginalSourceHash = (sourceText) => {
  if (typeof sourceText !== "string") return null;

  return sha256(sourceText);
};

export const getNormalizedFixtureHash = (sourceText) => {
  const normalized = normalizeFixtureSource(sourceText);

  return normalized === null ? null : sha256(normalized);
};

const identifyOneSpecification = (specification, expected) => {
  if (!specification || typeof specification !== "object") {
    return {
      recognized: false,
      reasonCode: "SPECIFICATION_MISSING",
    };
  }

  if (specification.parseStatus !== "VALID") {
    return {
      recognized: false,
      reasonCode: "SPECIFICATION_NOT_VALID",
    };
  }

  const sourceText = specification.sourceText;
  const originalHash = getOriginalSourceHash(sourceText);

  if (!originalHash || originalHash !== specification.contentHash) {
    return {
      recognized: false,
      reasonCode: "SPECIFICATION_CONTENT_INTEGRITY_FAILED",
    };
  }

  const normalizedHash = getNormalizedFixtureHash(sourceText);

  if (normalizedHash !== expected.normalizedContentHash) {
    return {
      recognized: false,
      reasonCode: "SPECIFICATION_FIXTURE_NOT_RECOGNIZED",
    };
  }

  const document = specification.document;

  if (
    specification.sourceFormat !== "yaml" ||
    specification.title !== expected.title ||
    !document ||
    document.openapi !== expected.openapiVersion ||
    document.info?.title !== expected.title ||
    document.info?.version !== expected.apiVersion
  ) {
    return {
      recognized: false,
      reasonCode: "SPECIFICATION_FIXTURE_METADATA_MISMATCH",
    };
  }

  return {
    recognized: true,
    fixtureId: expected.fixtureId,
    normalizedContentHash: normalizedHash,
    implementationVersion: expected.implementationVersion ?? null,
  };
};

export const verifyTrustedFixturePair = ({
  baseline,
  candidate,
  direction,
}) => {
  const reasons = [];

  if (!baseline || !candidate) {
    return {
      eligible: false,
      reasons: [{
        code: "COMPARISON_SPECIFICATIONS_MISSING",
        message: "Both comparison specification versions must be available.",
      }],
      baseline: null,
      candidate: null,
      executionTarget: null,
    };
  }

  if (String(baseline.projectId) !== String(candidate.projectId)) {
    reasons.push({
      code: "SPECIFICATIONS_BELONG_TO_DIFFERENT_PROJECTS",
      message: "The baseline and candidate must belong to the same project.",
    });
  }

  if (direction !== FIXTURE_REGISTRY.direction) {
    reasons.push({
      code: "UNSUPPORTED_COMPARISON_DIRECTION",
      message: "Only baseline-consumer-to-candidate-provider comparisons can be executed.",
    });
  }

  const baselineIdentity = identifyOneSpecification(
    baseline,
    FIXTURE_REGISTRY.baseline
  );

  const candidateIdentity = identifyOneSpecification(
    candidate,
    FIXTURE_REGISTRY.candidate
  );

  if (!baselineIdentity.recognized) {
    reasons.push({
      code: baselineIdentity.reasonCode,
      message: "The baseline specification is not the trusted Demo Store V1 fixture.",
    });
  }

  if (!candidateIdentity.recognized) {
    reasons.push({
      code: candidateIdentity.reasonCode,
      message: "The candidate specification is not the trusted Demo Store V2 fixture.",
    });
  }

  if (reasons.length > 0) {
    return {
      eligible: false,
      reasons,
      baseline: baselineIdentity,
      candidate: candidateIdentity,
      executionTarget: null,
    };
  }

  return {
    eligible: true,
    reasons: [],
    baseline: baselineIdentity,
    candidate: candidateIdentity,
    executionTarget: {
      type: "BUNDLED_DEMO_STORE",
      fixtureId: FIXTURE_REGISTRY.candidate.fixtureId,
      implementationVersion: FIXTURE_REGISTRY.candidate.implementationVersion,
    },
    supportedOperations: SUPPORTED_DEMO_STORE_OPERATIONS.map((operation) => ({
      ...operation,
    })),
  };
};

export default {
  FIXTURE_REGISTRY,
  SUPPORTED_DEMO_STORE_OPERATIONS,
  normalizeFixtureSource,
  getOriginalSourceHash,
  getNormalizedFixtureHash,
  verifyTrustedFixturePair,
};