import AppError from "../utils/appError.js";

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "Internal server error";
  let details = [];

  // Application-defined errors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = Array.isArray(err.details) ? err.details : [];
  }

  // MongoDB duplicate-key errors
  else if (err?.code === 11000) {
    statusCode = 409;
    code = "DUPLICATE_RESOURCE";
    message = "A resource with the same unique value already exists.";
  }

  // Mongoose schema validation errors
  else if (err?.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "The submitted data failed validation.";

    details = Object.values(err.errors ?? {}).map((issue) => ({
      field: issue.path,
      message: "Invalid value.",
    }));
  }

  // Mongoose casting errors
  else if (err?.name === "CastError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "The request contains an invalid value.";

    details = [
      {
        field: err.path,
        message: "Invalid identifier or value.",
      },
    ];
  }

  // Malformed JSON request bodies
  else if (err?.type === "entity.parse.failed") {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Request body contains invalid JSON.";
  }

  // Request body exceeds the configured limit
  else if (err?.type === "entity.too.large") {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request payload is too large.";
  }

  // Database connection failures
  else if (
    [
      "MongooseServerSelectionError",
      "MongoNetworkError",
      "MongoServerSelectionError",
    ].includes(err?.name)
  ) {
    statusCode = 503;
    code = "SERVICE_UNAVAILABLE";
    message = "The database service is temporarily unavailable.";
  }

  // Log unexpected server errors internally
  if (statusCode >= 500) {
    console.error(err);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
};

export default errorHandler;