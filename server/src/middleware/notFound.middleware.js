import AppError from "../utils/appError.js";

const notFound = (req, res, next) => {
  next(
    new AppError("The requested route was not found.", {
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    })
  );
};

export default notFound;