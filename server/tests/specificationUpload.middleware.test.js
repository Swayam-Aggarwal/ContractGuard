import express from "express";
import request from "supertest";

import {
  describe,
  expect,
  it,
} from "vitest";

import uploadSpecificationFile, {
  SPECIFICATION_FILE_LIMIT_BYTES,
} from "../src/middleware/specificationUpload.middleware.js";

const createTestApp = () => {
  const app = express();

  app.post(
    "/upload",
    uploadSpecificationFile,
    (req, res) => {
      return res.status(200).json({
        sourceText: req.specificationUpload.sourceText,
        sourceFormat: req.specificationUpload.sourceFormat,
        label: req.body.label ?? null,
        fileSize: req.file.size,
      });
    }
  );

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    return res.status(error.statusCode ?? 500).json({
      success: false,
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: error.message,
        details: error.details ?? [],
      },
    });
  });

  return app;
};

const app = createTestApp();

describe("Specification upload middleware", () => {
  it("should accept a JSON specification", async () => {
    const sourceText = '{"openapi":"3.0.3"}';

    const response = await request(app)
      .post("/upload")
      .attach("file", Buffer.from(sourceText), {
        filename: "spec.json",
        contentType: "application/json",
      });

    expect(response.status).toBe(200);
    expect(response.body.sourceFormat).toBe("json");
    expect(response.body.sourceText).toBe(sourceText);
  });

  it("should accept a YAML specification", async () => {
    const sourceText = "openapi: 3.0.3";

    const response = await request(app)
      .post("/upload")
      .attach("file", Buffer.from(sourceText), {
        filename: "spec.yaml",
        contentType: "application/yaml",
      });

    expect(response.status).toBe(200);
    expect(response.body.sourceFormat).toBe("yaml");
    expect(response.body.sourceText).toBe(sourceText);
  });

  it("should accept the .yml extension and extract the optional label", async () => {
    const sourceText = "openapi: 3.0.3";

    const response = await request(app)
      .post("/upload")
      .field("label", "release-1")
      .attach("file", Buffer.from(sourceText), {
        filename: "spec.YML",
        contentType: "application/octet-stream",
      });

    expect(response.status).toBe(200);
    expect(response.body.sourceFormat).toBe("yaml");
    expect(response.body.label).toBe("release-1");
  });

  it("should reject unsupported file extensions", async () => {
    const response = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("some content"), {
        filename: "spec.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe(
      "UNSUPPORTED_MEDIA_TYPE"
    );
  });

  it("should reject requests without a file", async () => {
    const response = await request(app)
      .post("/upload")
      .field("label", "release-1");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should reject an unexpected file field name", async () => {
    const response = await request(app)
      .post("/upload")
      .attach("specification", Buffer.from("{}"), {
        filename: "spec.json",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should reject more than one file", async () => {
    const response = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("{}"), {
        filename: "first.json",
      })
      .attach("file", Buffer.from("{}"), {
        filename: "second.json",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should reject files larger than 1 MiB", async () => {
    const oversizedBuffer = Buffer.alloc(
      SPECIFICATION_FILE_LIMIT_BYTES + 1,
      65
    );

    const response = await request(app)
      .post("/upload")
      .attach("file", oversizedBuffer, {
        filename: "large.json",
      });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe(
      "SPEC_LIMIT_EXCEEDED"
    );
  });

  it("should reject more than one non-file field", async () => {
    const response = await request(app)
      .post("/upload")
      .field("label", "release-1")
      .field("extra", "unexpected")
      .attach("file", Buffer.from("{}"), {
        filename: "spec.json",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should reject multipart fields larger than the configured limit", async () => {
    const response = await request(app)
      .post("/upload")
      .field("label", "a".repeat(321))
      .attach("file", Buffer.from("{}"), {
        filename: "spec.json",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("should reject files containing invalid UTF-8", async () => {
    const invalidUtf8 = Buffer.from([
      0xc3,
      0x28,
    ]);

    const response = await request(app)
      .post("/upload")
      .attach("file", invalidUtf8, {
        filename: "spec.json",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });
});
