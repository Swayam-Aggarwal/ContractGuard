import path from "node:path";
import { TextDecoder } from "node:util";

import multer from "multer";

import AppError from "../utils/appError.js";

export const SPECIFICATION_FILE_LIMIT_BYTES = 1024 * 1024;

export const SPECIFICATION_FILE_FIELD = "file";

const SUPPORTED_EXTENSIONS = new Map([
  [".json", "json"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
]);

const createUploadError = (
  message,
  {
    statusCode = 400,
    code = "VALIDATION_ERROR",
    field = "file",
  } = {}
) =>
  new AppError(message, {
    statusCode,
    code,
    details: [
      {
        field,
        message,
      },
    ],
  });

const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    fileSize: SPECIFICATION_FILE_LIMIT_BYTES,
    files: 1,
    fields: 1,
    parts: 2,
    fieldNameSize: 50,
    fieldSize: 320,
    fieldNestingDepth: 0,
    headerPairs: 100,
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(
      file.originalname ?? ""
    ).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return callback(
        createUploadError(
          "Only JSON and YAML specification files are supported.",
          {
            statusCode: 415,
            code: "UNSUPPORTED_MEDIA_TYPE",
            field: "file",
          }
        )
      );
    }

    return callback(null, true);
  },
});

const mapMulterError = (error) => {
  if (error.code === "LIMIT_FILE_SIZE") {
    return createUploadError(
      "The specification file exceeds the maximum size of 1 MiB.",
      {
        statusCode: 413,
        code: "SPEC_LIMIT_EXCEEDED",
      }
    );
  }

  if (error.code === "LIMIT_UNEXPECTED_FILE") {
    return createUploadError(
      "Upload exactly one specification file using the file field.",
      {
        field: "file",
      }
    );
  }

  if (
    [
      "LIMIT_FILE_COUNT",
      "LIMIT_FIELD_COUNT",
      "LIMIT_FIELD_KEY",
      "LIMIT_FIELD_VALUE",
      "LIMIT_PART_COUNT",
      "LIMIT_FIELD_NESTING",
    ].includes(error.code)
  ) {
    return createUploadError(
      "The multipart request contains too many or oversized fields.",
      {
        field: "form",
      }
    );
  }

  return createUploadError(
    "The uploaded file could not be processed.",
    {
      field: "file",
    }
  );
};

const uploadSpecificationFile = (req, res, next) => {
  upload.single(SPECIFICATION_FILE_FIELD)(
    req,
    res,
    (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          return next(mapMulterError(error));
        }

        return next(error);
      }

      if (!req.file) {
        return next(
          createUploadError(
            "A specification file is required."
          )
        );
      }

      if (!Buffer.isBuffer(req.file.buffer)) {
        return next(
          createUploadError(
            "The uploaded file could not be read."
          )
        );
      }

      let sourceText;

      try {
        sourceText = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(req.file.buffer);
      } catch {
        return next(
          createUploadError(
            "The specification file must contain valid UTF-8 text."
          )
        );
      }

      const extension = path.extname(
        req.file.originalname
      ).toLowerCase();

      req.specificationUpload = {
        sourceText,
        sourceBuffer: Buffer.from(req.file.buffer),
        sourceFormat: SUPPORTED_EXTENSIONS.get(extension),
      };

      return next();
    }
  );
};

export default uploadSpecificationFile;