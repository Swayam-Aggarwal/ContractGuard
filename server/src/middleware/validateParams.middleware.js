import AppError from "../utils/appError.js";

const validateParams = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        message: issue.message,
      }));

      return next(
        new AppError(
          "The request contains invalid route parameters.",
          {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            details,
          }
        )
      );
    }

    req.validatedParams = result.data;

    return next();
  };
};

export default validateParams;