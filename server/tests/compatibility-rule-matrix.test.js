import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import compareCompatibility from "../src/services/compatibility-analysis.service.js";
import { resolveCompatibilityRule } from "../src/services/compatibility-rule-mapping.service.js";
import { createFindingContract } from "../src/services/compatibility-report-contract.js";

const schema = (category, changeType, classification, field) => ({
  category,
  changeType,
  classification,
  field,
});

const rules = [
  ["OP-001", "BREAKING", { changeType: "OPERATION_REMOVED" }],
  ["OP-002", "NON_BREAKING", { changeType: "OPERATION_ADDED" }],
  ["OP-003", "BREAKING", { changeType: "OPERATION_PATH_CHANGED" }],
  ["OP-004", "POTENTIALLY_BREAKING", { changeType: "PATH_PARAMETER_RENAMED" }],
  ["OP-005", "POTENTIALLY_BREAKING", { changeType: "OPERATION_ID_CHANGED" }],
  ["OP-006", "INFORMATIONAL", { changeType: "OPERATION_DOCUMENTATION_CHANGED" }],
  ["OP-007", "INFORMATIONAL", { changeType: "OPERATION_DEPRECATED" }],
  ["OP-008", "BREAKING", { changeType: "OPERATION_METHOD_CHANGED" }],

  ["PAR-001", "BREAKING", { category: "parameter", changeType: "PARAMETER_ADDED", newValue: { required: true } }],
  ["PAR-002", "NON_BREAKING", { category: "parameter", changeType: "PARAMETER_ADDED", newValue: { required: false } }],
  ["PAR-003", "POTENTIALLY_BREAKING", { category: "parameter", changeType: "PARAMETER_REMOVED" }],
  ["PAR-004", "BREAKING", schema("parameter", "SCHEMA_TYPE_CHANGED", "BREAKING", "parameters.query.q.schema.type")],
  ["PAR-005", "NON_BREAKING", schema("parameter", "SCHEMA_TYPE_CHANGED", "NON_BREAKING", "parameters.query.q.schema.type")],
  ["PAR-006", "BREAKING", { category: "parameter", changeType: "PARAMETER_REQUIRED", newValue: true }],
  ["PAR-007", "NON_BREAKING", { category: "parameter", changeType: "PARAMETER_OPTIONAL", newValue: false }],
  ["PAR-008", "BREAKING", schema("parameter", "SCHEMA_ENUM_CHANGED", "BREAKING", "parameters.query.q.schema.enum")],
  ["PAR-009", "NON_BREAKING", schema("parameter", "SCHEMA_ENUM_CHANGED", "NON_BREAKING", "parameters.query.q.schema.enum")],
  ["PAR-010", "POTENTIALLY_BREAKING", { category: "parameter", changeType: "PARAMETER_SERIALIZATION_CHANGED" }],
  ["PAR-011", "INFORMATIONAL", { category: "parameter", changeType: "PARAMETER_DOCUMENTATION_CHANGED" }],
  ["PAR-012", "BREAKING", { category: "parameter", changeType: "PARAMETER_LOCATION_CHANGED" }],

  ["REQ-001", "BREAKING", { category: "requestBody", changeType: "REQUEST_BODY_REQUIRED" }],
  ["REQ-002", "NON_BREAKING", { category: "requestBody", changeType: "REQUEST_BODY_OPTIONAL" }],
  ["REQ-003", "BREAKING", schema("requestBody", "MEDIA_TYPE_REMOVED", "BREAKING", "requestBody.content.application/json")],
  ["REQ-004", "NON_BREAKING", { category: "requestBody", changeType: "MEDIA_TYPE_ADDED" }],
  ["REQ-005", "BREAKING", schema("requestBody", "SCHEMA_REQUIRED_ADDED", "BREAKING", "requestBody.content.application/json.schema.required")],
  ["REQ-006", "NON_BREAKING", schema("requestBody", "SCHEMA_REQUIRED_REMOVED", "NON_BREAKING", "requestBody.content.application/json.schema.required")],
  ["REQ-007", "POTENTIALLY_BREAKING", schema("requestBody", "SCHEMA_PROPERTY_REMOVED", "POTENTIALLY_BREAKING", "requestBody.content.application/json.schema.properties.name")],
  ["REQ-008", "BREAKING", schema("requestBody", "SCHEMA_TYPE_CHANGED", "BREAKING", "requestBody.content.application/json.schema.properties.name.type")],
  ["REQ-009", "BREAKING", schema("requestBody", "SCHEMA_ENUM_CHANGED", "BREAKING", "requestBody.content.application/json.schema.properties.status.enum")],
  ["REQ-010", "BREAKING", schema("requestBody", "SCHEMA_CONSTRAINT_CHANGED", "BREAKING", "requestBody.content.application/json.schema.properties.age.minimum")],
  ["REQ-011", "NON_BREAKING", schema("requestBody", "SCHEMA_CONSTRAINT_CHANGED", "NON_BREAKING", "requestBody.content.application/json.schema.properties.age.minimum")],
  ["REQ-012", "POTENTIALLY_BREAKING", { category: "requestBody", changeType: "REQUEST_ENCODING_CHANGED" }],

  ["RES-001", "BREAKING", schema("response", "SCHEMA_PROPERTY_REMOVED", "BREAKING", "responses.200.content.application/json.schema.properties.id")],
  ["RES-002", "BREAKING", schema("response", "SCHEMA_TYPE_CHANGED", "BREAKING", "responses.200.content.application/json.schema.properties.id.type")],
  ["RES-003", "BREAKING", schema("response", "SCHEMA_REQUIRED_REMOVED", "BREAKING", "responses.200.content.application/json.schema.required")],
  ["RES-004", "NON_BREAKING", schema("response", "SCHEMA_REQUIRED_ADDED", "NON_BREAKING", "responses.200.content.application/json.schema.required")],
  ["RES-005", "POTENTIALLY_BREAKING", schema("response", "SCHEMA_PROPERTY_ADDED", "POTENTIALLY_BREAKING", "responses.200.content.application/json.schema.properties.extra")],
  ["RES-006", "POTENTIALLY_BREAKING", schema("response", "SCHEMA_ENUM_CHANGED", "POTENTIALLY_BREAKING", "responses.200.content.application/json.schema.properties.status.enum")],
  ["RES-007", "NON_BREAKING", schema("response", "SCHEMA_ENUM_CHANGED", "NON_BREAKING", "responses.200.content.application/json.schema.properties.status.enum")],
  ["RES-008", "NON_BREAKING", schema("response", "SCHEMA_CONSTRAINT_CHANGED", "NON_BREAKING", "responses.200.content.application/json.schema.properties.age.maximum")],
  ["RES-009", "POTENTIALLY_BREAKING", schema("response", "SCHEMA_CONSTRAINT_CHANGED", "POTENTIALLY_BREAKING", "responses.200.content.application/json.schema.properties.age.maximum")],
  ["RES-010", "POTENTIALLY_BREAKING", schema("response", "MEDIA_TYPE_REMOVED", "POTENTIALLY_BREAKING", "responses.200.content.application/json")],
  ["RES-011", "POTENTIALLY_BREAKING", { category: "response", changeType: "RESPONSE_REMOVED" }],
  ["RES-012", "INFORMATIONAL", { category: "response", changeType: "RESPONSE_DOCUMENTATION_CHANGED" }],
  ["RES-013", "POTENTIALLY_BREAKING", { category: "response", changeType: "SCHEMA_NULLABILITY_CHANGED", newValue: true, field: "responses.200.content.application/json.schema.properties.name.nullable" }],
  ["RES-014", "NON_BREAKING", { category: "response", changeType: "SCHEMA_NULLABILITY_CHANGED", newValue: false, field: "responses.200.content.application/json.schema.properties.name.nullable" }],

  ["SEC-001", "POTENTIALLY_BREAKING", { changeType: "SECURITY_REQUIREMENTS_CHANGED", oldValue: [], newValue: [{ ApiKey: [] }] }],
  ["SEC-002", "POTENTIALLY_BREAKING", { changeType: "SECURITY_REQUIREMENTS_CHANGED", oldValue: [{ OAuth: ["read"] }], newValue: [{ OAuth: ["read", "write"] }] }],
  ["SEC-003", "INFORMATIONAL", { changeType: "SECURITY_REQUIREMENTS_CHANGED", oldValue: [{ OAuth: ["read", "write"] }], newValue: [{ OAuth: ["read"] }] }],
  ["SRV-001", "INFORMATIONAL", { changeType: "SERVER_CONFIGURATION_CHANGED", oldValue: [{ url: "https://old.example.test", variables: {} }], newValue: [{ url: "https://new.example.test", variables: {} }] }],
  ["SRV-002", "POTENTIALLY_BREAKING", { changeType: "SERVER_CONFIGURATION_CHANGED", oldValue: [{ url: "https://{region}.example.test", variables: { region: { default: "us" } } }], newValue: [{ url: "https://{region}.example.test", variables: { region: { default: "eu" } } }] }],
  ["SCH-001", "UNSUPPORTED", { category: "response", changeType: "RESPONSE_ADDED", severity: "NON_BREAKING" }],
];

const rulesDocument = readFileSync(
  new URL("../docs/Rules.md", import.meta.url),
  "utf8"
);

const documentedRuleIds = [
  ...rulesDocument.matchAll(
    /^\|\s*`((?:OP|PAR|REQ|RES|SEC|SRV|SCH)-\d{3})`\s*\|/gm
  ),
].map((match) => match[1]).sort();

const makeSpecification = ({ parameter, responseDescription }) => ({
  openapi: "3.2.1",
  info: {
    title: "Compatibility rule matrix fixture",
    version: "1.0.0",
  },
  paths: {
    "/items": {
      get: {
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            ...parameter,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: responseDescription,
          },
        },
      },
    },
  },
});

describe("CG-COMPAT-1.1 normative rule mapping matrix", () => {
  it("contains exactly one fixture for every documented rule ID", () => {
    expect(rules.map(([ruleId]) => ruleId).sort()).toEqual(
      documentedRuleIds
    );
    expect(new Set(rules.map(([ruleId]) => ruleId)).size).toBe(52);
  });

  it.each(rules)(
    "maps %s to %s and creates a complete finding",
    (ruleId, classification, change) => {
      expect(resolveCompatibilityRule(change)).toEqual({
        ruleId,
        classification,
      });

      const finding = createFindingContract({
        ...change,
        operationKey: "op_rule_matrix_fixture",
        affectedOperationKeys: ["op_rule_matrix_fixture"],
        path: "/fixture",
        method: "GET",
        field: change.field ?? `rule.${ruleId}`,
        baselinePointer: "#/paths/~1fixture/get",
        candidatePointer: "#/paths/~1fixture/get",
        message: `Rule-matrix fixture for ${ruleId}.`,
      });

      expect(finding).toMatchObject({
        ruleId,
        classification,
        path: "/fixture",
        method: "GET",
        operationKey: "op_rule_matrix_fixture",
        affectedOperationKeys: ["op_rule_matrix_fixture"],
        summary: `Rule-matrix fixture for ${ruleId}.`,
      });

      expect(finding.changeId).toMatch(/^[a-f0-9]{64}$/);
      expect(finding.jsonPointer).toMatch(
        /^#\/paths\/~1fixture\/get/
      );
      expect(finding.rationale.length).toBeGreaterThan(0);
    }
  );
});

describe("documentation-only compatibility findings", () => {
  it("maps parameter description changes to PAR-011", () => {
    const result = compareCompatibility(
      makeSpecification({
        parameter: { description: "Baseline description" },
        responseDescription: "Successful response",
      }),
      makeSpecification({
        parameter: { description: "Updated description" },
        responseDescription: "Successful response",
      })
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "PAR-011",
          classification: "INFORMATIONAL",
          field: "parameters.query.q.documentation",
        }),
      ])
    );
  });

  it("maps parameter example changes to PAR-011", () => {
    const result = compareCompatibility(
      makeSpecification({
        parameter: { example: "baseline" },
        responseDescription: "Successful response",
      }),
      makeSpecification({
        parameter: { example: "candidate" },
        responseDescription: "Successful response",
      })
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "PAR-011",
          classification: "INFORMATIONAL",
        }),
      ])
    );
  });

  it("maps response description changes to RES-012", () => {
    const result = compareCompatibility(
      makeSpecification({
        parameter: {},
        responseDescription: "Baseline description",
      }),
      makeSpecification({
        parameter: {},
        responseDescription: "Updated description",
      })
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "RES-012",
          classification: "INFORMATIONAL",
          field: "responses.200.description",
        }),
      ])
    );
  });

  it("maps response media-type example changes to RES-012", () => {
    expect(
      resolveCompatibilityRule({
        category: "response",
        changeType: "MEDIA_TYPE_EXAMPLES_CHANGED",
      })
    ).toEqual({
      ruleId: "RES-012",
      classification: "INFORMATIONAL",
    });
  });
});

describe("unsupported security comparison boundaries", () => {
  it("marks multiple security alternatives as unsupported", () => {
    expect(
      resolveCompatibilityRule({
        changeType: "SECURITY_REQUIREMENTS_CHANGED",
        oldValue: [{ OAuth: ["read"] }, { ApiKey: [] }],
        newValue: [{ OAuth: ["read", "write"] }],
      })
    ).toEqual({
      ruleId: "SCH-001",
      classification: "UNSUPPORTED",
    });
  });

  it("marks mixed scope additions and removals as unsupported", () => {
    expect(
      resolveCompatibilityRule({
        changeType: "SECURITY_REQUIREMENTS_CHANGED",
        oldValue: [{ OAuth: ["read"] }],
        newValue: [{ OAuth: ["write"] }],
      })
    ).toEqual({
      ruleId: "SCH-001",
      classification: "UNSUPPORTED",
    });
  });
});