import { z } from "zod";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiRequest } from "../../lib/api.js";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email must not exceed 254 characters.")
  .pipe(
    z.email({
      error: "Enter a valid email address.",
    })
  );

const loginPasswordSchema = z
  .string()
  .min(1, "Password is required.")
  .superRefine((password, context) => {
    const normalized = password.normalize("NFC");
    const byteLength = new TextEncoder().encode(normalized).length;

    if (byteLength > 72) {
      context.addIssue({
        code: "custom",
        message: "Password must not exceed 72 UTF-8 bytes.",
      });
    }
  });

const registrationPasswordSchema = z
  .string()
  .superRefine((password, context) => {
    const normalized = password.normalize("NFC");
    const characterCount = Array.from(normalized).length;
    const byteLength = new TextEncoder().encode(normalized).length;

    if (characterCount < 15) {
      context.addIssue({
        code: "custom",
        message: "Password must contain at least 15 characters.",
      });
    }

    if (byteLength > 72) {
      context.addIssue({
        code: "custom",
        message: "Password must not exceed 72 UTF-8 bytes.",
      });
    }
  });

export const loginSchema = z
  .object({
    email: emailSchema,
    password: loginPasswordSchema,
  })
  .strict();

export const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .max(80, "Display name must not exceed 80 characters.")
      .optional(),

    email: emailSchema,
    password: registrationPasswordSchema,
  })
  .strict();

export const authQueryKeys = {
  currentUser: ["auth", "me"],
};

export const authApi = {
  currentUser: async () => {
    const data = await apiRequest("/api/v1/auth/me");

    return data.user;
  },

  login: async (credentials) => {
    const data = await apiRequest("/api/v1/auth/login", {
      method: "POST",
      body: credentials,
    });

    return data.user;
  },

  register: async (details) => {
    const data = await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: details,
    });

    return data.user;
  },

  logout: async () => {
    return apiRequest("/api/v1/auth/logout", {
      method: "POST",
      body: {},
    });
  },
};

export const useCurrentUser = () => {
  return useQuery({
    queryKey: authQueryKeys.currentUser,
    queryFn: authApi.currentUser,
    retry: false,
    staleTime: 30_000,
  });
};

export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.login,

    onSuccess: (user) => {
      queryClient.setQueryData(
        authQueryKeys.currentUser,
        user
      );
    },
  });
};

export const useRegister = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.register,

    onSuccess: (user) => {
      queryClient.setQueryData(
        authQueryKeys.currentUser,
        user
      );
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.logout,

    onSuccess: () => {
      queryClient.setQueryData(
        authQueryKeys.currentUser,
        null
      );

      queryClient.removeQueries({
        queryKey: ["projects"],
      });
    },
  });
};