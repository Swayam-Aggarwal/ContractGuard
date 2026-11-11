import { describe, expect, it } from "vitest";

import createCompatibilityAnalysis from
  "../src/services/compatibility-analysis.service.js";

const createDocument = (schema) => ({
  openapi: "3.2.1",
  info: { title: "Unsupported Construct API", version: "1.0.0" },
  paths: {
    "/items": {
      get: {
        responses: {
          "200": {
            description: "Success.",
            content: {
              "application/json": { schema },
            },
          },
        },
      },
    },
  },
});

describe("Unsupported compatibility findings", () => {
  it("creates an UNSUPPORTED finding for a changed schema composition", () => {
    const baseline = createDocument({
      type: "object",
      allOf: [{ required: ["id"] }],
    });

    const candidate = createDocument({
      type: "object",
      allOf: [{ required: ["id", "name"] }],
    });

    const result = createCompatibilityAnalysis(baseline, candidate);

    expect(result.analysisStatus).toBe("PARTIAL");
    expect(result.warnings.length).toBeGreaterThan(0);

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "SCH-001",
          changeType: "ANALYSIS_UNSUPPORTED_CONSTRUCT",
          classification: "UNSUPPORTED",
          severity: "INFO",
          breaking: false,
          jsonPointer: expect.stringContaining("/responses/200/content"),
        }),
      ])
    );

    expect(result.summary.unsupported).toBeGreaterThan(0);
  });

  it("creates unsupported findings for stored parser diagnostics without claiming compatibility", () => {
    const spec = createDocument({ type: "string" });

    const result = createCompatibilityAnalysis(spec, spec, {
      baselineWarnings: [
        { field: "paths", message: "Parser could not fully normalize a construct." },
      ],
    });

    expect(result.analysisStatus).toBe("PARTIAL");
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "SCH-001",
          classification: "UNSUPPORTED",
          field: "baseline.parser.paths",
        }),
      ])
    );
  });
});