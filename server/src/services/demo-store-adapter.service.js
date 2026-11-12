import AppError from "../utils/appError.js";

export const DEMO_STORE_PRODUCTS = Object.freeze([
  Object.freeze({
    id: "1001",
    name: "Mechanical Keyboard",
    price: "3499.00",
    currency: "INR",
    categoryId: "electronics",
  }),
  Object.freeze({
    id: "1002",
    name: "Wireless Mouse",
    price: "1299.00",
    currency: "INR",
    categoryId: "electronics",
  }),
  Object.freeze({
    id: "1003",
    name: "Desk Lamp",
    price: "899.00",
    currency: "INR",
    categoryId: "home-office",
  }),
]);

const unsupportedOperationError = () =>
  new AppError(
    "The selected operation is not supported by the bundled Demo Store implementation.",
    {
      statusCode: 422,
      code: "TEST_RUN_OPERATION_UNSUPPORTED",
    }
  );

const invalidRequestError = (message) =>
  new AppError(message, {
    statusCode: 400,
    code: "TEST_RUN_REQUEST_INVALID",
  });

const jsonResponse = (statusCode, body) => ({
  statusCode,
  contentType: "application/json",
  body,
});

const assertNoUnexpectedKeys = (record, allowedKeys) => {
  if (
    record === null ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    (
      Object.getPrototypeOf(record) !== Object.prototype &&
      Object.getPrototypeOf(record) !== null
    )
  ) {
    throw invalidRequestError("Execution parameters must be plain objects.");
  }

  const allowed = new Set(allowedKeys);

  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw invalidRequestError("The bundled adapter received an undeclared parameter.");
  }
};

export const executeDemoStoreAdapter = async ({
  method,
  path,
  pathParams = {},
  queryParams = {},
}) => {
  if (method !== "GET") {
    throw unsupportedOperationError();
  }

  if (path === "/products") {
    assertNoUnexpectedKeys(pathParams, []);
    assertNoUnexpectedKeys(queryParams, ["limit"]);

    const requestedLimit = queryParams.limit ?? 20;

    if (
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > 100
    ) {
      throw invalidRequestError(
        "The Demo Store limit must be an integer between 1 and 100."
      );
    }

    return jsonResponse(200, {
      items: DEMO_STORE_PRODUCTS.slice(0, requestedLimit).map((product) => ({
        ...product,
      })),
      total: DEMO_STORE_PRODUCTS.length,
    });
  }

  if (path === "/products/{productId}") {
    assertNoUnexpectedKeys(pathParams, ["productId"]);
    assertNoUnexpectedKeys(queryParams, []);

    const productId = pathParams.productId;

    if (typeof productId !== "string" || productId.length === 0) {
      throw invalidRequestError("A productId path parameter is required.");
    }

    const product = DEMO_STORE_PRODUCTS.find(
      (entry) => entry.id === productId
    );

    if (!product) {
      return jsonResponse(404, {
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found.",
      });
    }

    return jsonResponse(200, { ...product });
  }

  throw unsupportedOperationError();
};

export default executeDemoStoreAdapter;