import { describe, expect, it } from "vitest";

import {
  DEMO_STORE_PRODUCTS,
  executeDemoStoreAdapter,
} from "../src/services/demo-store-adapter.service.js";

describe("bundled Demo Store adapter", () => {
  it("returns the V2 product list with a bounded limit", async () => {
    const result = await executeDemoStoreAdapter({
      method: "GET",
      path: "/products",
      queryParams: { limit: 2 },
    });

    expect(result.statusCode).toBe(200);
    expect(result.contentType).toBe("application/json");
    expect(result.body.items).toHaveLength(2);
    expect(result.body.total).toBe(DEMO_STORE_PRODUCTS.length);
    expect(typeof result.body.items[0].price).toBe("string");
    expect(result.body.items[0]).toHaveProperty("categoryId");
  });

  it("returns an existing product by its path parameter", async () => {
    const result = await executeDemoStoreAdapter({
      method: "GET",
      path: "/products/{productId}",
      pathParams: { productId: "1001" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.id).toBe("1001");
    expect(typeof result.body.price).toBe("string");
  });

  it("returns the documented V2 error envelope for an unknown product", async () => {
    const result = await executeDemoStoreAdapter({
      method: "GET",
      path: "/products/{productId}",
      pathParams: { productId: "missing" },
    });

    expect(result.statusCode).toBe(404);

    expect(result.body).toEqual({
      code: "PRODUCT_NOT_FOUND",
      message: "Product not found.",
    });
  });

  it("rejects non-GET and unknown operations", async () => {
    await expect(
      executeDemoStoreAdapter({
        method: "POST",
        path: "/products",
      })
    ).rejects.toMatchObject({
      code: "TEST_RUN_OPERATION_UNSUPPORTED",
    });

    await expect(
      executeDemoStoreAdapter({
        method: "GET",
        path: "/anything",
      })
    ).rejects.toMatchObject({
      code: "TEST_RUN_OPERATION_UNSUPPORTED",
    });
  });
});