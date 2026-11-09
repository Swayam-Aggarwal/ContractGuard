
const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const ALLOWED_HEADERS = new Set([
  "content-type",
  "authorization",
  "x-csrf-token",
]);

const createCorsMiddleware = (allowedOrigin) => {
  return (req, res, next) => {
    const requestOrigin = req.get("origin");

    // Requests from non-browser clients generally have no Origin header.
    if (!requestOrigin) {
      return next();
    }

    // Never grant CORS access to an unconfigured origin.
    if (requestOrigin !== allowedOrigin) {
      return next();
    }

    res.setHeader(
      "Access-Control-Allow-Origin",
      allowedOrigin
    );

    res.setHeader(
      "Access-Control-Allow-Credentials",
      "true"
    );

    res.vary("Origin");

    if (req.method !== "OPTIONS") {
      return next();
    }

    const requestedMethod = (
      req.get("access-control-request-method") || ""
    ).toUpperCase();

    if (
      requestedMethod &&
      !ALLOWED_METHODS.has(requestedMethod)
    ) {
      return res.status(405).end();
    }

    const requestedHeaders = (
      req.get("access-control-request-headers") || ""
    )
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);

    const hasDisallowedHeader = requestedHeaders.some(
      (header) => !ALLOWED_HEADERS.has(header)
    );

    if (hasDisallowedHeader) {
      return res.status(400).end();
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      [...ALLOWED_METHODS].join(", ")
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-CSRF-Token"
    );

    res.setHeader(
      "Access-Control-Max-Age",
      "600"
    );

    return res.status(204).end();
  };
};

export default createCorsMiddleware;
