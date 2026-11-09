import mongoose from "mongoose";

import { describe, expect, it } from "vitest";

import SpecVersion from "../src/models/specVersion.model.js";

const createValidSpecVersion = (overrides = {}) => ({
  projectId: new mongoose.Types.ObjectId(),
  uploadedBy: new mongoose.Types.ObjectId(),
  label: "v1",
  openapiVersion: "3.0.3",
  title: "Demo Store API",
  sourceFormat: "yaml",
  sourceText: `
openapi: 3.0.3
info:
  title: Demo Store API
  version: 1.0.0
paths: {}
`,
  document: {
    openapi: "3.0.3",
    info: {
      title: "Demo Store API",
      version: "1.0.0",
    },
    paths: {},
  },
  contentHash: "a".repeat(64),
  operationCount: 2,
  parseStatus: "VALID",
  warnings: [],
  ...overrides,
});

const expectInvalidField = async (document, field) => {
  let validationError;

  try {
    await document.validate();
  } catch (error) {
    validationError = error;
  }

  expect(validationError).toBeInstanceOf(
    mongoose.Error.ValidationError
  );

  expect(validationError.errors[field]).toBeDefined();
};

describe("SpecVersion model", () => {
  it("should accept a valid specification version", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion()
    );

    await specVersion.validate();

    expect(specVersion.isNew).toBe(true);
  });

  it("should use the specversions collection", () => {
    expect(SpecVersion.collection.collectionName).toBe(
      "specversions"
    );
  });

  it("should require all essential specification fields", async () => {
    const specVersion = new SpecVersion({});
    let validationError;

    try {
      await specVersion.validate();
    } catch (error) {
      validationError = error;
    }

    expect(validationError).toBeInstanceOf(
      mongoose.Error.ValidationError
    );

    for (const field of [
      "projectId",
      "uploadedBy",
      "label",
      "openapiVersion",
      "title",
      "sourceFormat",
      "sourceText",
      "document",
      "contentHash",
      "operationCount",
    ]) {
      expect(validationError.errors[field]).toBeDefined();
    }
  });

  it("should reject an unsupported source format", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        sourceFormat: "xml",
      })
    );

    await expectInvalidField(specVersion, "sourceFormat");
  });

  it("should reject an unsupported parse status", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        parseStatus: "PROCESSING",
      })
    );

    await expectInvalidField(specVersion, "parseStatus");
  });

  it("should reject an invalid SHA-256 content hash", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        contentHash: "not-a-valid-hash",
      })
    );

    await expectInvalidField(specVersion, "contentHash");
  });

  it("should reject an operation count outside the allowed range", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        operationCount: 501,
      })
    );

    await expectInvalidField(specVersion, "operationCount");
  });

  it("should reject a non-integer operation count", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        operationCount: 2.5,
      })
    );

    await expectInvalidField(specVersion, "operationCount");
  });

  it("should reject source text larger than 1 MiB", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        sourceText: "a".repeat(1024 * 1024 + 1),
      })
    );

    await expectInvalidField(specVersion, "sourceText");
  });

  it("should reject an array as the parsed document", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        document: [],
      })
    );

    await expectInvalidField(specVersion, "document");
  });

  it("should accept valid parser warnings", async () => {
    const specVersion = new SpecVersion(
      createValidSpecVersion({
        warnings: [
          {
            field: "paths./products",
            message: "A supported extension was not analyzed.",
          },
        ],
      })
    );

    await specVersion.validate();

    expect(specVersion.warnings).toHaveLength(1);
  });

  it("should reject more than 100 parser warnings", async () => {
    const warnings = Array.from(
      { length: 101 },
      (_, index) => ({
        field: `field-${index}`,
        message: "Parser warning.",
      })
    );

    const specVersion = new SpecVersion(
      createValidSpecVersion({ warnings })
    );

    await expectInvalidField(specVersion, "warnings");
  });

  it("should define the three required compound indexes", () => {
    const indexes = SpecVersion.schema.indexes();

    const indexNames = indexes.map(
      ([, options]) => options.name
    );

    expect(indexNames).toContain(
      "idx_specversions_project_created"
    );

    expect(indexNames).toContain(
      "uniq_specversions_project_hash"
    );

    expect(indexNames).toContain(
      "uniq_specversions_project_label"
    );

    const uniqueIndexes = indexes.filter(
      ([, options]) => options.unique === true
    );

    expect(uniqueIndexes).toHaveLength(2);
  });

  it("should mark specification data fields as immutable", () => {
    const immutableFields = [
      "projectId",
      "uploadedBy",
      "label",
      "openapiVersion",
      "title",
      "sourceFormat",
      "sourceText",
      "document",
      "contentHash",
      "operationCount",
      "parseStatus",
      "warnings",
    ];

    for (const field of immutableFields) {
      expect(
        SpecVersion.schema.path(field)?.options.immutable
      ).toBe(true);
    }
  });

  it("should reject unknown fields", () => {
    expect(() => {
      return new SpecVersion(
        createValidSpecVersion({
          ownerId: new mongoose.Types.ObjectId(),
        })
      );
    }).toThrow();
  });
});
