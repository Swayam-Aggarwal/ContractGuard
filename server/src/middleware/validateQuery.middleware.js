import AppError from "../utils/appError.js";

const validateQuery = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        message: issue.message,
      }));

      return next(
        new AppError(
          "The request contains invalid query parameters.",
          {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            details,
          }
        )
      );
    }

    req.validatedQuery = result.data;

    return next();
  };
};

export default validateQuery;