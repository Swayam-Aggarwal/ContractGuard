
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import compareSchemas from "../src/services/schema-compatibility.service.js";
import createCompatibilityAnalysis from
  "../src/services/compatibility-analysis.service.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const examplesDirectory = path.resolve(testDirectory, "../../examples");

const readExample = (fileName) => {
  const contents = readFileSync(
    path.join(examplesDirectory, fileName),
    "utf8"
  );

  return parse(contents);
};

describe("Schema type compatibility regressions", () => {
  it("classifies disjoint request types as breaking instead of warning", () => {
    const result = compareSchemas(
      { type: "number" },
      { type: "string" },
      { direction: "request" }
    );

    expect(result.warnings).toEqual([]);
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_TYPE_CHANGED",
          severity: "BREAKING",
          oldValue: ["number"],
          newValue: ["string"],
        }),
      ])
    );
  });

  it("classifies disjoint response types as breaking instead of warning", () => {
    const result = compareSchemas(
      { type: "number" },
      { type: "string" },
      { direction: "response" }
    );

    expect(result.warnings).toEqual([]);
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_TYPE_CHANGED",
          severity: "BREAKING",
        }),
      ])
    );
  });

  it("recognizes integer as a subset of number", () => {
    const expansion = compareSchemas(
      { type: "integer" },
      { type: "number" },
      { direction: "response" }
    );

    const narrowing = compareSchemas(
      { type: "number" },
      { type: "integer" },
      { direction: "response" }
    );

    expect(expansion.warnings).toEqual([]);
    expect(expansion.changes[0]).toMatchObject({
      changeType: "SCHEMA_TYPE_CHANGED",
      severity: "BREAKING",
    });

    expect(narrowing.warnings).toEqual([]);
    expect(narrowing.changes[0]).toMatchObject({
      changeType: "SCHEMA_TYPE_CHANGED",
      severity: "NON_BREAKING",
    });
  });

  it("retains a warning for genuinely partial type-set overlap", () => {
    const result = compareSchemas(
      { type: ["string", "integer"] },
      { type: ["number", "boolean"] },
      { direction: "response" }
    );

    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "schema.type",
        }),
      ])
    );
  });
});

describe("Demo Store v1 to v2 compatibility regression", () => {
  it("reports the price number-to-string change as breaking and completes analysis", () => {
    const baseline = readExample("demo-store-v1.yaml");
    const candidate = readExample("demo-store-v2.yaml");

    const result = createCompatibilityAnalysis(
      baseline,
      candidate
    );

    expect(result.analysisStatus).toBe("COMPLETE");
    expect(result.warnings).toEqual([]);

    expect(result.summary).toMatchObject({
      totalChanges: 8,
      breakingChanges: 6,
      nonBreakingChanges: 2,
      informationalChanges: 0,
    });

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "SCHEMA_TYPE_CHANGED",
          severity: "BREAKING",
          field: expect.stringContaining("price.type"),
          oldValue: ["number"],
          newValue: ["string"],
        }),
      ])
    );
  });
});
