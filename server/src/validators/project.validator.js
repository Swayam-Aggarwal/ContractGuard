import { z } from "zod";

const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Project name is required.")
  .max(80, "Project name must not exceed 80 characters.");

const projectDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Project description must not exceed 500 characters.")
  .transform((value) => value || undefined)
  .optional();

export const createProjectSchema = z
  .object({
    name: projectNameSchema,
    description: projectDescriptionSchema,
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: projectNameSchema.optional(),
    description: projectDescriptionSchema,
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    {
      message: "Provide at least one field to update.",
    }
  );

export const projectIdSchema = z
  .object({
    projectId: z
      .string()
      .regex(
        /^[a-f\d]{24}$/i,
        "Project ID must be a valid MongoDB ObjectId."
      ),
  })
  .strict();