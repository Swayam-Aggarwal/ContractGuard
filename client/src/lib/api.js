export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const apiRequest = async (
  path,
  {
    method = "GET",
    body,
    headers = {},
    signal,
  } = {}
) => {
  let response;

  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...headers,
      },
      body:
        body !== undefined
          ? JSON.stringify(body)
          : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
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
    const error = payload?.error;

    throw new ApiError(
      response.status,
      error?.code || "REQUEST_FAILED",
      error?.message || "The request could not be completed.",
      error?.details || []
    );
  }

  if (payload?.success !== true || !payload.data) {
    throw new ApiError(
      response.status,
      "INVALID_API_RESPONSE",
      "The server returned an unexpected response."
    );
  }

  return payload.data;
};