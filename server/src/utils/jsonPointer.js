import AppError from "./appError.js";

const createPointerError = (message, field = "ref") =>
  new AppError(message, {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    details: [
      {
        field,
        message,
      },
    ],
  });

const isRecord = (value) => {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
};

export const encodeJsonPointer = (segments = []) => {
  if (!Array.isArray(segments)) {
    throw new TypeError("JSON Pointer segments must be an array.");
  }

  if (segments.length === 0) {
    return "#";
  }

  return `#/${segments
    .map((segment) =>
      String(segment)
        .replace(/~/g, "~0")
        .replace(/\//g, "~1")
    )
    .join("/")}`;
};

export const parseJsonPointer = (reference) => {
  if (typeof reference !== "string" || !reference.startsWith("#")) {
    throw createPointerError(
      "Only internal JSON Pointer references are supported."
    );
  }

  let fragment;

  try {
    fragment = decodeURIComponent(reference.slice(1));
  } catch {
    throw createPointerError(
      "The reference contains invalid URI encoding."
    );
  }

  if (fragment === "") {
    return [];
  }

  if (!fragment.startsWith("/")) {
    throw createPointerError(
      "The reference must use # or a #/ JSON Pointer."
    );
  }

  return fragment
    .slice(1)
    .split("/")
    .map((segment) => {
      if (/~(?![01])/u.test(segment)) {
        throw createPointerError(
          "JSON Pointer segments may only use ~0 and ~1 escapes."
        );
      }

      return segment
        .replace(/~1/g, "/")
        .replace(/~0/g, "~");
    });
};

export const getJsonPointerValue = (document, segments) => {
  const parsedSegments = Array.isArray(segments)
    ? segments.map(String)
    : parseJsonPointer(segments);

  let current = document;

  for (const segment of parsedSegments) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/u.test(segment)) {
        return {
          found: false,
          value: undefined,
        };
      }

      const index = Number(segment);

      if (index >= current.length) {
        return {
          found: false,
          value: undefined,
        };
      }

      current = current[index];
      continue;
    }

    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return {
        found: false,
        value: undefined,
      };
    }

    current = current[segment];
  }

  return {
    found: true,
    value: current,
  };
};

export const resolveJsonPointer = (document, reference) => {
  const segments = parseJsonPointer(reference);
  const result = getJsonPointerValue(document, segments);

  return {
    ...result,
    reference,
    segments,
    pointer: encodeJsonPointer(segments),
  };
};