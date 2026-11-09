
export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
  }
}

const isFormData = (value) => {
  return (
    typeof FormData !== "undefined" &&
    value instanceof FormData
  );
};

export const apiRequest = async (
  path,
  {
    method = "GET",
    body,
    headers = {},
    signal,
  } = {}
) => {
  const bodyIsFormData = isFormData(body);
  const requestHeaders = new Headers(headers);

  if (!requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", "application/json");
  }

  // Let the browser add the multipart boundary for FormData requests.
  if (
    body !== undefined &&
    !bodyIsFormData &&
    !requestHeaders.has("Content-Type")
  ) {
    requestHeaders.set("Content-Type", "application/json");
  }

  let response;

  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: requestHeaders,
      body:
        body === undefined
          ? undefined
          : bodyIsFormData
            ? body
            : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Unable to connect to ContractGuard. Check whether the API server is running."
    );
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError = payload?.error;

    throw new ApiError(
      response.status,
      apiError?.code || "REQUEST_FAILED",
      apiError?.message || "The request could not be completed.",
      apiError?.details || []
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    payload.success !== true ||
    !Object.hasOwn(payload, "data")
  ) {
    throw new ApiError(
      response.status,
      "INVALID_API_RESPONSE",
      "The server returned an unexpected response."
    );
  }

  return payload.data;
};
