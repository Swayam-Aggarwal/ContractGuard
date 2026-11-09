import mongoose from "mongoose";

import {
  describe,
  expect,
  it,
} from "vitest";

import SpecVersion from "../src/models/specVersion.model.js";

const createValidSpecVersion = (overrides = {}) => ({
  projectId: new mongoose.Types.ObjectId(),
  uploadedBy: new mongoose.Types.ObjectId(),
  label: "v1",
  openapiVersion: "3.2.1",
  title: "ContractGuard Test API",

  sourceFormat: "json",

  sourceText: JSON.stringify({
    openapi: "3.2.1",

    info: {
      title: "ContractGuard Test API",
      version: "1.0.0",
    },

    paths: {},
  }),

  document: {
    openapi: "3.2.1",

    info: {
      title: "ContractGuard Test API",
      version: "1.0.0",
    },

    paths: {},
  },

  contentHash: "a".repeat(64),
  operationCount: 0,
  parseStatus: "VALID",
  warnings: [],

  ...overrides,
});

describe("Specification explorer completeness model", () => {
  it("should default missing explorer completeness to PARTIAL", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion()
    );

    await specVersion.validate();

    expect(specVersion.explorerCompleteness).toBe("PARTIAL");
    expect(specVersion.explorerWarnings).toEqual([]);
  });

  it("should accept COMPLETE explorer status", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        explorerCompleteness: "COMPLETE",
      })
    );

    await specVersion.validate();

    expect(specVersion.explorerCompleteness).toBe("COMPLETE");
  });

  it("should accept PARTIAL explorer status", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        explorerCompleteness: "PARTIAL",
      })
    );

    await specVersion.validate();

    expect(specVersion.explorerCompleteness).toBe("PARTIAL");
  });

  it("should reject unsupported explorer status values", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        explorerCompleteness: "UNKNOWN",
      })
    );

    await expect(
      specVersion.validate()
    ).rejects.toMatchObject({
      errors: {
        explorerCompleteness: expect.any(
          mongoose.Error.ValidatorError
        ),
      },
    });
  });

  it("should define only COMPLETE and PARTIAL as allowed explorer status values", () => {
    expect(
      SpecVersion.schema.path("explorerCompleteness")?.enumValues
    ).toEqual(["COMPLETE", "PARTIAL"]);
  });

  it("should mark explorer completeness as immutable", () => {
    expect(
      SpecVersion.schema.path("explorerCompleteness")?.options
        .immutable
    ).toBe(true);
  });

  it("should mark explorer warnings as immutable", () => {
    expect(
      SpecVersion.schema.path("explorerWarnings")?.options
        .immutable
    ).toBe(true);
  });

  it("should accept valid explorer warnings", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        explorerCompleteness: "PARTIAL",

        explorerWarnings: [
          {
            field: "paths./products.query",
            message: "QUERY operations are not included.",
          },
        ],
      })
    );

    await specVersion.validate();

    expect(specVersion.explorerWarnings).toHaveLength(1);
  });

  it("should reject more than 100 explorer warnings", async () => {
    const explorerWarnings = Array.from(
      { length: 101 },
      (_, index) => ({
        field: `field-${index}`,
        message: "Explorer warning.",
      })
    );

    const specVersion = new SpecVersion(
      createValidSpecVersion({
        explorerCompleteness: "PARTIAL",
        explorerWarnings,
      })
    );

    await expect(
      specVersion.validate()
    ).rejects.toMatchObject({
      errors: {
        explorerWarnings: expect.any(
          mongoose.Error.ValidatorError
        ),
      },
    });
  });

  it("should not define the old analysisCompleteness field", () => {
    expect(
      SpecVersion.schema.path("analysisCompleteness")
    ).toBeUndefined();
  });
});