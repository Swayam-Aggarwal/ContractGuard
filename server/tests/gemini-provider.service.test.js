
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createGeminiProvider,
  GEMINI_PROVIDER_TIMEOUT_MS,
  GEMINI_PROVIDER_RETRY_OPTIONS,
} from "../src/services/gemini-provider.service.js";

const createSafeModelContext = (
  operationId = "getProduct"
) => {
  const operationDefinitions = {
    listProducts: {
      method: "GET",
      path: "/products",
      pathParameters: [],
      queryParameters: ["limit"],
    },

    getProduct: {
      method: "GET",
      path: "/products/{productId}",
      pathParameters: ["productId"],
      queryParameters: [],
    },
  };

  const selected = operationDefinitions[operationId];

  return {
    contextVersion: "DEMO_STORE_AI_CONTEXT_V2",

    comparison: {
      baseline: {
        fixtureId: "DEMO_STORE_V1",
        apiVersion: "1.0.0",
      },

      candidate: {
        fixtureId: "DEMO_STORE_V2",
        apiVersion: "2.0.0",
      },

      direction: "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
    },

    operations: [
      {
        operationId,
        method: selected.method,
        path: selected.path,
        pathParameters: selected.pathParameters,
        queryParameters: selected.queryParameters,
      },
    ],

    compatibilityFindings: [],
  };
};

describe("Gemini provider service", () => {
  it("sends one allowlisted operation, applies bounded retries, and disables Interaction storage", async () => {
    let receivedOptions;
    let receivedClientOptions;

    const clientFactory = vi.fn((options) => {
      receivedClientOptions = options;

      return {
        interactions: {
          create: vi.fn(async (requestOptions) => {
            receivedOptions = requestOptions;

            return {
              status: "completed",
              output_text: '{"suggestions":[]}',
            };
          }),
        },
      };
    });

    const modelContext = createSafeModelContext(
      "getProduct"
    );

    const provider = createGeminiProvider({
      config: {
        GEMINI_API_KEY: "test-key",
        GEMINI_MODEL: "gemini-3.8-flash",
      },

      clientFactory,
    });

    const output =
      await provider.generateSuggestions(modelContext);

    expect(output).toBe('{"suggestions":[]}');

    expect(clientFactory).toHaveBeenCalledOnce();

    expect(receivedClientOptions.apiKey).toBe("test-key");

    expect(
      receivedClientOptions.httpOptions.timeout
    ).toBe(GEMINI_PROVIDER_TIMEOUT_MS);

    expect(GEMINI_PROVIDER_TIMEOUT_MS).toBe(90_000);

    expect(
      receivedClientOptions.httpOptions.retryOptions
    ).toEqual({
      attempts: 2,
      initialDelay: 1,
      maxDelay: 3,
      expBase: 2,
      jitter: 1,
      httpStatusCodes: [
        408,
        500,
        502,
        503,
        504,
      ],
    });

    expect(GEMINI_PROVIDER_RETRY_OPTIONS.attempts)
      .toBe(2);

    expect(GEMINI_PROVIDER_RETRY_OPTIONS.httpStatusCodes)
      .toContain(503);

    expect(GEMINI_PROVIDER_RETRY_OPTIONS.httpStatusCodes)
      .not.toContain(429);

    expect(receivedOptions.model).toBe("gemini-3.8-flash");

    expect(receivedOptions.store).toBe(false);
    expect(receivedOptions.background).toBe(false);
    expect(receivedOptions.stream).toBe(false);

    expect(
      receivedOptions.generation_config.max_output_tokens
    ).toBe(1200);

    expect(
      receivedOptions.generation_config.thinking_level
    ).toBe("low");

    expect(receivedOptions.tools).toBeUndefined();

    expect(receivedOptions.response_format.schema.type)
      .toBe("object");

    const requestPayload = JSON.parse(
      receivedOptions.input
    );

    expect(requestPayload.context.operations).toHaveLength(1);

    expect(
      requestPayload.context.operations[0].operationId
    ).toBe("getProduct");

    expect(
      JSON.stringify(requestPayload)
    ).not.toContain("operationKey");

    expect(
      JSON.stringify(requestPayload)
    ).not.toContain("sourceText");

    expect(
      JSON.stringify(requestPayload)
    ).not.toContain("contentHash");

    expect(receivedOptions.system_instruction)
      .toContain("single supplied synthetic Demo Store");
  });

  it("accepts one selected listProducts operation", async () => {
    let receivedOptions;

    const provider = createGeminiProvider({
      config: {
        GEMINI_API_KEY: "test-key",
      },

      clientFactory: () => ({
        interactions: {
          create: vi.fn(async (requestOptions) => {
            receivedOptions = requestOptions;

            return {
              status: "completed",
              output_text: '{"suggestions":[]}',
            };
          }),
        },
      }),
    });

    await provider.generateSuggestions(
      createSafeModelContext("listProducts")
    );

    const requestPayload = JSON.parse(
      receivedOptions.input
    );

    expect(requestPayload.context.operations).toHaveLength(1);

    expect(
      requestPayload.context.operations[0].operationId
    ).toBe("listProducts");
  });

  it("rejects unexpected context fields before creating the Gemini client", async () => {
    const clientFactory = vi.fn();

    const modelContext = {
      ...createSafeModelContext("getProduct"),
      sourceText: "private uploaded OpenAPI content",
    };

    const provider = createGeminiProvider({
      config: {
        GEMINI_API_KEY: "test-key",
      },

      clientFactory,
    });

    await expect(
      provider.generateSuggestions(modelContext)
    ).rejects.toMatchObject({
      code: "AI_CONTEXT_INVALID",
      statusCode: 422,
    });

    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("rejects contexts containing more than one operation", async () => {
    const clientFactory = vi.fn();

    const modelContext = createSafeModelContext(
      "getProduct"
    );

    modelContext.operations.push(
      createSafeModelContext("listProducts").operations[0]
    );

    const provider = createGeminiProvider({
      config: {
        GEMINI_API_KEY: "test-key",
      },

      clientFactory,
    });

    await expect(
      provider.generateSuggestions(modelContext)
    ).rejects.toMatchObject({
      code: "AI_CONTEXT_INVALID",
    });

    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("rejects an unexpected finding path before creating a Gemini client", async () => {
    const clientFactory = vi.fn();

    const modelContext = createSafeModelContext(
      "getProduct"
    );

    modelContext.compatibilityFindings = [
      {
        category: "response",
        classification: "BREAKING",
        method: "GET",
        path: "/products",
        field: "Product.total",
        summary: "A finding for another operation.",
      },
    ];

    const provider = createGeminiProvider({
      config: {
        GEMINI_API_KEY: "test-key",
      },

      clientFactory,
    });

    await expect(
      provider.generateSuggestions(modelContext)
    ).rejects.toMatchObject({
      code: "AI_CONTEXT_INVALID",
    });

    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("rejects missing API keys before creating a client", async () => {
    const clientFactory = vi.fn();

    const provider = createGeminiProvider({
      config: {
        GEMINI_API_KEY: "",
      },

      clientFactory,
    });

    await expect(
      provider.generateSuggestions(
        createSafeModelContext()
      )
    ).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
      statusCode: 503,
    });

    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("maps provider quota errors to a controlled response without exposing provider details", async () => {
    const logSpy = vi.spyOn(
      console,
      "error"
    ).mockImplementation(() => {});

    try {
      const provider = createGeminiProvider({
        config: {
          GEMINI_API_KEY: "test-key",
          GEMINI_MODEL: "gemini-3.8-flash",
        },

        clientFactory: () => ({
          interactions: {
            create: async () => {
              throw {
                status: 429,
                message: "provider detail must not escape",
              };
            },
          },
        }),
      });

      await expect(
        provider.generateSuggestions(
          createSafeModelContext()
        )
      ).rejects.toMatchObject({
        code: "AI_PROVIDER_RATE_LIMITED",
        statusCode: 429,
        message: expect.not.stringContaining("provider detail"),
      });

      expect(logSpy).toHaveBeenCalledOnce();

      expect(logSpy).toHaveBeenCalledWith(
        "[Gemini provider] Request failed.",
        expect.objectContaining({
          provider: "Google Gemini",
          model: "gemini-3.8-flash",
          status: 429,
          configuredMaxAttempts: 2,
        })
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("logs useful provider diagnostics without exposing the API key", async () => {
    const apiKey =
      "AIzaSyTestSecretKey_12345678901234567890";

    const logSpy = vi.spyOn(
      console,
      "error"
    ).mockImplementation(() => {});

    try {
      const provider = createGeminiProvider({
        config: {
          GEMINI_API_KEY: apiKey,
          GEMINI_MODEL: "gemini-3.8-flash",
        },

        clientFactory: () => ({
          interactions: {
            create: async () => {
              throw {
                status: 503,
                code: "UNAVAILABLE",
                message: `Gemini overloaded. api_key=${apiKey}`,
              };
            },
          },
        }),
      });

      await expect(
        provider.generateSuggestions(
          createSafeModelContext()
        )
      ).rejects.toMatchObject({
        code: "AI_PROVIDER_UNAVAILABLE",
        statusCode: 503,
      });

      expect(logSpy).toHaveBeenCalledOnce();

      expect(logSpy).toHaveBeenCalledWith(
        "[Gemini provider] Request failed.",
        expect.objectContaining({
          provider: "Google Gemini",
          model: "gemini-3.8-flash",
          status: 503,
          errorCode: "UNAVAILABLE",
          configuredMaxAttempts: 2,
        })
      );

      const serializedLogs = JSON.stringify(
        logSpy.mock.calls
      );

      expect(serializedLogs).not.toContain(apiKey);
      expect(serializedLogs).toContain("[REDACTED]");
      expect(serializedLogs).toContain("503");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("rejects incomplete interactions", async () => {
    const provider = createGeminiProvider({
      config: {
        GEMINI_API_KEY: "test-key",
      },

      clientFactory: () => ({
        interactions: {
          create: vi.fn().mockResolvedValue({
            status: "in_progress",
            output_text: "",
          }),
        },
      }),
    });

    await expect(
      provider.generateSuggestions(
        createSafeModelContext()
      )
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_INCOMPLETE_RESPONSE",
      statusCode: 502,
    });
  });
});
