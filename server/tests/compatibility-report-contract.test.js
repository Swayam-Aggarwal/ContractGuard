import { describe, expect, it } from "vitest";

import {
  COMPATIBILITY_DIRECTION,
  COMPATIBILITY_RULESET_VERSION,
  createChangeId,
  createClassificationSummary,
  createFindingContract,
} from "../src/services/compatibility-report-contract.js";

describe("compatibility report contract", () => {
  it("fixes the server-side comparison direction and ruleset", () => {
    expect(COMPATIBILITY_DIRECTION).toBe(
      "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER"
    );

    expect(COMPATIBILITY_RULESET_VERSION).toBe("CG-COMPAT-1.1");
  });

  it("maps legacy severities to the expanded classifications", () => {
    expect(createFindingContract({
      changeType: "LEGACY_BREAKING",
      severity: "BREAKING",
    }).classification).toBe("BREAKING");

    expect(createFindingContract({
      changeType: "LEGACY_NON_BREAKING",
      severity: "NON_BREAKING",
    }).classification).toBe("NON_BREAKING");

    expect(createFindingContract({
      changeType: "LEGACY_INFO",
      severity: "INFO",
    }).classification).toBe("INFORMATIONAL");
  });

  it("generates the same change ID for the same rule, operation and location", () => {
    const input = {
      ruleId: "RES-002",
      operationKey: "GET /products",
      jsonPointer: "#/paths/~1products/get/responses/200",
      field: "schema.properties.price.type",
    };

    expect(createChangeId(input)).toBe(createChangeId(input));
    expect(createChangeId(input)).toMatch(/^[a-f0-9]{64}$/u);

    expect(createChangeId(input)).not.toBe(createChangeId({
      ...input,
      field: "schema.properties.name.type",
    }));
  });

  it("creates stable metadata and operation impact for a finding", () => {
    const finding = createFindingContract({
      category: "operation",
      changeType: "OPERATION_REMOVED",
      severity: "BREAKING",
      operationKey: "GET /products",
      baselinePointer: "#/paths/~1products/get",
      field: "operation",
      message: "The operation was removed.",
    });

    expect(finding).toMatchObject({
      ruleId: "OP-001",
      classification: "BREAKING",
      affectedOperationKeys: ["GET /products"],
      jsonPointer: "#/paths/~1products/get",
      summary: "The operation was removed.",
    });

    expect(finding.rationale).toContain("baseline-valid requests");
    expect(finding.changeId).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps the legacy severity alias consistent with the authoritative classification", () => {
    const finding = createFindingContract({
      changeType: "PARAMETER_SERIALIZATION_CHANGED",
      severity: "BREAKING",
      classification: "POTENTIALLY_BREAKING",
    });

    expect(finding.classification).toBe("POTENTIALLY_BREAKING");
    expect(finding.severity).toBe("INFO");
    expect(finding.breaking).toBe(false);
  });

  it("maps implemented operation, parameter and response changes to normative rules", () => {
    expect(createFindingContract({
      category: "metadata",
      changeType: "OPERATION_ID_CHANGED",
      severity: "BREAKING",
      field: "operationId",
    })).toMatchObject({
      ruleId: "OP-005",
      classification: "POTENTIALLY_BREAKING",
      severity: "INFO",
    });

    expect(createFindingContract({
      category: "parameter",
      changeType: "PARAMETER_REMOVED",
      severity: "BREAKING",
      field: "parameters.query.customerId",
    })).toMatchObject({
      ruleId: "PAR-003",
      classification: "POTENTIALLY_BREAKING",
      severity: "INFO",
    });

    expect(createFindingContract({
      category: "response",
      changeType: "RESPONSE_REMOVED",
      severity: "BREAKING",
      field: "responses.404",
    })).toMatchObject({
      ruleId: "RES-011",
      classification: "POTENTIALLY_BREAKING",
      severity: "INFO",
    });
  });

  it("turns categorized findings without a normative rule into unsupported findings", () => {
    expect(createFindingContract({
      category: "response",
      changeType: "RESPONSE_ADDED",
      severity: "NON_BREAKING",
      field: "responses.201",
      message: "A response was added.",
    })).toMatchObject({
      ruleId: "SCH-001",
      classification: "UNSUPPORTED",
      severity: "INFO",
      breaking: false,
    });
  });

  it("derives a field-level JSON Pointer from the operation source pointer", () => {
    const finding = createFindingContract({
      category: "schema",
      changeType: "SCHEMA_TYPE_CHANGED",
      classification: "BREAKING",
      severity: "BREAKING",
      baselinePointer: "#/paths/~1products/get",
      candidatePointer: "#/paths/~1products/get",
      field: "responses.200.content.application/json.schema.properties.price.type",
    });

    expect(finding.jsonPointer).toBe(
      "#/paths/~1products/get/responses/200/content/application~1json/schema/properties/price/type"
    );

    expect(finding.ruleId).toBe("RES-002");
  });

  it("keeps field-level pointers stable when the finding contract is applied repeatedly", () => {
    const input = {
      category: "schema",
      changeType: "SCHEMA_TYPE_CHANGED",
      classification: "BREAKING",
      severity: "BREAKING",
      path: "/products",
      method: "GET",
      operationKey: "GET /products",
      baselinePointer: "#/paths/~1products/get",
      candidatePointer: "#/paths/~1products/get",
      field: "responses.200.content.application/json.schema.properties.price.type",
      message: "The response property type changed.",
    };

    const first = createFindingContract(input);
    const second = createFindingContract(first);
    const third = createFindingContract(second);

    const expectedPointer =
      "#/paths/~1products/get/responses/200/content/application~1json/schema/properties/price/type";

    expect(first.baselinePointer).toBe(expectedPointer);
    expect(first.candidatePointer).toBe(expectedPointer);
    expect(first.jsonPointer).toBe(expectedPointer);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("keeps findings in deterministic path, method, severity, pointer and rule order", () => {
    const changes = [
      {
        path: "/z",
        method: "GET",
        classification: "NON_BREAKING",
        ruleId: "OP-002",
      },
      {
        path: "/a",
        method: "POST",
        classification: "BREAKING",
        ruleId: "OP-001",
      },
      {
        path: "/a",
        method: "GET",
        classification: "POTENTIALLY_BREAKING",
        ruleId: "PAR-003",
      },
      {
        path: "/a",
        method: "GET",
        classification: "BREAKING",
        ruleId: "OP-001",
      },
    ];

    createClassificationSummary(changes);

    expect(
      changes.map(({ path, method, classification }) => [
        path,
        method,
        classification,
      ])
    ).toEqual([
      ["/a", "GET", "BREAKING"],
      ["/a", "GET", "POTENTIALLY_BREAKING"],
      ["/a", "POST", "BREAKING"],
      ["/z", "GET", "NON_BREAKING"],
    ]);
  });

  it("counts all five classifications independently", () => {
    const changes = [
      { classification: "BREAKING" },
      { classification: "POTENTIALLY_BREAKING" },
      { classification: "NON_BREAKING" },
      { classification: "INFORMATIONAL" },
      { classification: "UNSUPPORTED" },
      { severity: "INFO" },
    ];

    expect(createClassificationSummary(changes)).toEqual({
      breaking: 1,
      potentiallyBreaking: 1,
      nonBreaking: 1,
      informational: 2,
      unsupported: 1,
    });
  });
});