
import { describe, expect, it } from "vitest";

import createOperationIndex from "../src/services/openapi-operation-index.service.js";
import addReferenceImpact from "../src/services/reference-impact.service.js";

const createSpecification = ({ minimumNameLength = 1 } = {}) => ({
  openapi: "3.0.3",
  info: {
    title: "Reference impact fixture",
    version: "1.0.0",
  },
  paths: {
    "/records": {
      get: {
        operationId: "listRecords",
        responses: {
          "200": {
            description: "Records",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RecordList",
                },
              },
            },
          },
        },
      },
    },
    "/records/{recordId}": {
      get: {
        operationId: "getRecord",
        parameters: [
          {
            name: "recordId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Record",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Record",
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      RecordList: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Record" },
          },
        },
      },
      Record: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: {
            type: "string",
            minLength: minimumNameLength,
          },
        },
      },
    },
  },
});

describe("reference impact service", () => {
  it("maps shared response-schema changes to every matched baseline operation", () => {
    const baseline = createSpecification({ minimumNameLength: 1 });
    const candidate = createSpecification({ minimumNameLength: 3 });
    const operations = createOperationIndex(baseline);
    const listOperation = operations.find(
      (operation) => operation.path === "/records" && operation.method === "GET"
    );
    const detailOperation = operations.find(
      (operation) => operation.path === "/records/{recordId}" && operation.method === "GET"
    );

    const analysis = {
      analysisStatus: "COMPLETE",
      warnings: [],
      changes: [
        {
          changeId: "change-1",
          operationKey: listOperation.operationKey,
          affectedOperationKeys: [listOperation.operationKey],
          category: "schema",
          field: "responses.200.content.application/json.schema",
        },
      ],
    };

    const result = addReferenceImpact(analysis, baseline, candidate);

    expect(result.analysisStatus).toBe("COMPLETE");
    expect(result.changes[0].affectedOperationKeys).toEqual([
      listOperation.operationKey,
      detailOperation.operationKey,
    ].sort());
    expect(result.changes[0].changeId).toBe("change-1");
  });


  it("does not fan out non-schema response changes through unrelated schema references", () => {
    const baseline = createSpecification();
    const candidate = createSpecification();
    const [operation] = createOperationIndex(baseline);

    const result = addReferenceImpact(
      {
        analysisStatus: "COMPLETE",
        warnings: [],
        changes: [
          {
            operationKey: operation.operationKey,
            affectedOperationKeys: [operation.operationKey],
            category: "response",
            field: "responses.200.description",
          },
        ],
      },
      baseline,
      candidate
    );

    expect(result.changes[0].affectedOperationKeys).toEqual([
      operation.operationKey,
    ]);
  });

  it("marks impact analysis partial when an external reference blocks a complete graph", () => {
    const baseline = createSpecification();
    const candidate = createSpecification();
    candidate.paths["/records"].get.responses["200"].content[
      "application/json"
    ].schema = { $ref: "https://example.invalid/record.json" };

    const [operation] = createOperationIndex(baseline);
    const result = addReferenceImpact(
      {
        analysisStatus: "COMPLETE",
        warnings: [],
        changes: [
          {
            operationKey: operation.operationKey,
            affectedOperationKeys: [operation.operationKey],
            category: "response",
            field: "responses.200.content",
          },
        ],
      },
      baseline,
      candidate
    );

    expect(result.analysisStatus).toBe("PARTIAL");
    expect(result.warnings.some((warning) =>
      warning.message.includes("external reference")
    )).toBe(true);
    expect(result.changes[0].affectedOperationKeys).toContain(
      operation.operationKey
    );
  });
});
