import AppError from "../utils/appError.js";

const validateBody = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        message: issue.message,
      }));

      return next(
        new AppError(
          "The request contains invalid fields.",
          {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            details,
          }
        )
      );
    }

    req.body = result.data;

    return next();
  };
};

export default validateBody;