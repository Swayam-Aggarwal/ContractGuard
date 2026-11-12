import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  getNormalizedFixtureHash,
  getOriginalSourceHash,
  verifyTrustedFixturePair,
} from "../src/services/fixture-registry.service.js";

const baselinePath = fileURLToPath(
  new URL("../../examples/demo-store-v1.yaml", import.meta.url)
);

const candidatePath = fileURLToPath(
  new URL("../../examples/demo-store-v2.yaml", import.meta.url)
);

const baselineSource = readFileSync(baselinePath, "utf8");
const candidateSource = readFileSync(candidatePath, "utf8");

const createSpecification = (sourceText, version) => ({
  projectId: "507f1f77bcf86cd799439011",
  contentHash: getOriginalSourceHash(sourceText),
  sourceText,
  sourceFormat: "yaml",
  title: "Demo Store API",
  parseStatus: "VALID",
  document: {
    openapi: "3.0.3",
    info: {
      title: "Demo Store API",
      version,
    },
  },
});

describe("trusted fixture registry", () => {
  it("recognizes the exact bundled V1-to-V2 specification pair", () => {
    const result = verifyTrustedFixturePair({
      baseline: createSpecification(baselineSource, "1.0.0"),
      candidate: createSpecification(candidateSource, "2.0.0"),
      direction: "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
    });

    expect(result.eligible).toBe(true);
    expect(result.baseline.fixtureId).toBe("DEMO_STORE_V1");
    expect(result.candidate.fixtureId).toBe("DEMO_STORE_V2");

    expect(result.executionTarget).toEqual({
      type: "BUNDLED_DEMO_STORE",
      fixtureId: "DEMO_STORE_V2",
      implementationVersion: "DEMO_STORE_V2",
    });
  });

  it("accepts Windows line endings and optional BOM without accepting content edits", () => {
    const windowsSource =
      `\uFEFF${baselineSource.replace(/\n/gu, "\r\n")}`;

    expect(getNormalizedFixtureHash(windowsSource)).toBe(
      getNormalizedFixtureHash(baselineSource)
    );

    const edited = windowsSource.replace(
      "Demo Store API",
      "Modified Store API"
    );

    const result = verifyTrustedFixturePair({
      baseline: createSpecification(edited, "1.0.0"),
      candidate: createSpecification(candidateSource, "2.0.0"),
      direction: "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
    });

    expect(result.eligible).toBe(false);

    expect(
      result.reasons.some(
        (entry) => entry.code === "SPECIFICATION_FIXTURE_NOT_RECOGNIZED"
      )
    ).toBe(true);
  });

  it("rejects content whose original hash does not match its source text", () => {
    const baseline = {
      ...createSpecification(baselineSource, "1.0.0"),
      contentHash: "0".repeat(64),
    };

    const result = verifyTrustedFixturePair({
      baseline,
      candidate: createSpecification(candidateSource, "2.0.0"),
      direction: "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
    });

    expect(result.eligible).toBe(false);

    expect(
      result.reasons.some(
        (entry) => entry.code === "SPECIFICATION_CONTENT_INTEGRITY_FAILED"
      )
    ).toBe(true);
  });

  it("rejects a reversed comparison direction", () => {
    const result = verifyTrustedFixturePair({
      baseline: createSpecification(baselineSource, "1.0.0"),
      candidate: createSpecification(candidateSource, "2.0.0"),
      direction: "CANDIDATE_PROVIDER_TO_BASELINE_CONSUMER",
    });

    expect(result.eligible).toBe(false);

    expect(
      result.reasons.some(
        (entry) => entry.code === "UNSUPPORTED_COMPARISON_DIRECTION"
      )
    ).toBe(true);
  });
});