import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },

    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Project slug must be URL-safe.",
      ],
      immutable: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    collection: "projects",
    autoIndex: process.env.NODE_ENV !== "production",
  }
);

// Optimizes the current user's project listing.
projectSchema.index(
  { ownerId: 1, updatedAt: -1 },
  {
    name: "idx_projects_owner_updated_at",
  }
);

// Project slugs must be unique for each owner.
projectSchema.index(
  { ownerId: 1, slug: 1 },
  {
    unique: true,
    name: "uniq_projects_owner_slug",
  }
);

const Project =
  mongoose.models.Project ||
  mongoose.model("Project", projectSchema);

export default Project;