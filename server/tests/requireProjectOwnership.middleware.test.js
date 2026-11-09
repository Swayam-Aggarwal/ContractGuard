import { beforeEach, describe, expect, it, vi } from "vitest";

import Project from "../src/models/project.model.js";

import requireProjectOwnership from "../src/middleware/requireProjectOwnership.middleware.js";

const PROJECT_ID = "65a123456789012345678901";
const OWNER_ID = "65a123456789012345678902";

describe("Project ownership middleware", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should allow access when the authenticated user owns the project", async () => {
    vi.spyOn(Project, "exists").mockResolvedValue({
      _id: PROJECT_ID,
    });

    const req = {
      params: {
        projectId: PROJECT_ID,
      },
      validatedParams: {
        projectId: PROJECT_ID,
      },
      user: {
        id: OWNER_ID,
      },
    };

    const next = vi.fn();

    await requireProjectOwnership(req, {}, next);

    expect(Project.exists).toHaveBeenCalledWith({
      _id: PROJECT_ID,
      ownerId: OWNER_ID,
    });

    expect(req.authorizedProjectId).toBe(PROJECT_ID);
    expect(next).toHaveBeenCalledOnce();
  });

  it("should reject a project that does not belong to the authenticated user", async () => {
    vi.spyOn(Project, "exists").mockResolvedValue(null);

    const req = {
      params: {
        projectId: PROJECT_ID,
      },
      validatedParams: {
        projectId: PROJECT_ID,
      },
      user: {
        id: OWNER_ID,
      },
    };

    await expect(
      requireProjectOwnership(req, {}, vi.fn())
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });

    expect(Project.exists).toHaveBeenCalledOnce();
  });

  it("should reject an invalid project ID without querying MongoDB", async () => {
    const existsSpy = vi.spyOn(Project, "exists");

    const req = {
      params: {
        projectId: "invalid-id",
      },
      user: {
        id: OWNER_ID,
      },
    };

    await expect(
      requireProjectOwnership(req, {}, vi.fn())
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });

    expect(existsSpy).not.toHaveBeenCalled();
  });

  it("should reject a missing authenticated user", async () => {
    const existsSpy = vi.spyOn(Project, "exists");

    const req = {
      params: {
        projectId: PROJECT_ID,
      },
    };

    await expect(
      requireProjectOwnership(req, {}, vi.fn())
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
    });

    expect(existsSpy).not.toHaveBeenCalled();
  });
});
