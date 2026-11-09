import { describe, expect, it } from "vitest";

import {
  encodeJsonPointer,
  getJsonPointerValue,
  parseJsonPointer,
  resolveJsonPointer,
} from "../src/utils/jsonPointer.js";

describe("JSON Pointer utilities", () => {
  it("should parse the document root pointer", () => {
    expect(parseJsonPointer("#")).toEqual([]);
  });

  it("should decode escaped pointer segments", () => {
    expect(
      parseJsonPointer("#/components/schemas/A~1B~0C")
    ).toEqual([
      "components",
      "schemas",
      "A/B~C",
    ]);
  });

  it("should decode percent-encoded fragments", () => {
    expect(
      parseJsonPointer("#/components/schemas/My%20Schema")
    ).toEqual([
      "components",
      "schemas",
      "My Schema",
    ]);
  });

  it("should encode pointer segments", () => {
    expect(
      encodeJsonPointer([
        "components",
        "schemas",
        "A/B~C",
      ])
    ).toBe("#/components/schemas/A~1B~0C");
  });

  it("should reject external references", () => {
    expect(() =>
      parseJsonPointer("https://example.com/schema.json")
    ).toThrow(
      "Only internal JSON Pointer references are supported."
    );
  });

  it("should reject unsupported anchor fragments", () => {
    expect(() => parseJsonPointer("#Product")).toThrow(
      "The reference must use # or a #/ JSON Pointer."
    );
  });

  it("should reject invalid tilde escapes", () => {
    expect(() =>
      parseJsonPointer("#/schemas/Invalid~2Name")
    ).toThrow(
      "JSON Pointer segments may only use ~0 and ~1 escapes."
    );
  });

  it("should retrieve object properties and array items", () => {
    const document = {
      components: {
        schemas: [
          { type: "string" },
          { type: "integer" },
        ],
      },
    };

    expect(
      getJsonPointerValue(
        document,
        ["components", "schemas", "1"]
      )
    ).toEqual({
      found: true,
      value: { type: "integer" },
    });
  });

  it("should report missing properties without throwing", () => {
    expect(
      resolveJsonPointer(
        {},
        "#/components/schemas/Missing"
      )
    ).toMatchObject({
      found: false,
      pointer: "#/components/schemas/Missing",
    });
  });
});