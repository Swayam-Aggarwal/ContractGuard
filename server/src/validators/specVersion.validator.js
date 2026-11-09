
import { z } from "zod";

import {
  OPENAPI_COMPONENT_TYPES,
} from "../constants/openapi.js";

const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    "ID must be a valid MongoDB ObjectId."
  );

const componentTypeSchema = z.enum(
  OPENAPI_COMPONENT_TYPES
);

const componentNameSchema = z
  .string()
  .min(1, "Component name cannot be empty.")
  .max(200, "Component name must not exceed 200 characters.");

export const uploadSpecificationSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Version label cannot be empty.")
      .max(80, "Version label must not exceed 80 characters.")
      .optional(),
  })
  .strict();

export const specVersionIdSchema = z
  .object({
    specVersionId: objectIdSchema,
  })
  .strict();

export const specVersionOperationParamsSchema = z
  .object({
    specVersionId: objectIdSchema,
    operationKey: z
      .string()
      .regex(
        /^op_[A-Za-z0-9_-]{43}$/,
        "Operation key is invalid."
      ),
  })
  .strict();

export const specVersionComponentTypeParamsSchema = z
  .object({
    specVersionId: objectIdSchema,
    componentType: componentTypeSchema,
  })
  .strict();

export const specVersionComponentParamsSchema = z
  .object({
    specVersionId: objectIdSchema,
    componentType: componentTypeSchema,
    componentName: componentNameSchema,
  })
  .strict();

export const specVersionReferenceQuerySchema = z
  .object({
    ref: z
      .string()
      .min(1, "Reference cannot be empty.")
      .max(2000, "Reference must not exceed 2000 characters.")
      .startsWith(
        "#",
        "Only internal references beginning with # are supported."
      ),
  })
  .strict();
