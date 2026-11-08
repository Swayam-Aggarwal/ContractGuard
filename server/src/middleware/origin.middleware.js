const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const createOriginMiddleware = (allowedOrigin) => {
  return (req, res, next) => {
    // Read-only requests don't require Origin validation
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    const originHeader = req.get("origin");

    let requestOrigin;

    if (originHeader !== undefined) {
      // Prefer Origin when the browser provides it
      if (originHeader !== "null") {
        try {
          const parsedOrigin = new URL(originHeader);

          // Origin must contain only scheme, host and port
          if (parsedOrigin.origin === originHeader) {
            requestOrigin = parsedOrigin.origin;
          }
        } catch {
          // Invalid Origin will be rejected below
        }
      }
    } else {
      // Use Referer only when Origin is absent
      const refererHeader = req.get("referer");

      if (refererHeader) {
        try {
          requestOrigin = new URL(refererHeader).origin;
        } catch {
          // Invalid Referer will be rejected below
        }
      }
    }

    if (requestOrigin !== allowedOrigin) {
      return res.status(403).json({
        success: false,
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "Request origin is not allowed.",
          details: [],
        },
      });
    }

    return next();
  };
};

export default createOriginMiddleware;