
import mongoose from "mongoose";

const warningSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      immutable: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
      immutable: true,
    },
  },
  {
    _id: false,
    id: false,
  }
);

const specVersionSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      immutable: true,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    label: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
      immutable: true,
    },

    openapiVersion: {
      type: String,
      required: true,
      match: /^3\.(?:0|1|2)\.\d+$/u,
      immutable: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
      immutable: true,
    },

    sourceFormat: {
      type: String,
      required: true,
      enum: ["json", "yaml"],
      immutable: true,
    },

    sourceText: {
      type: String,
      required: true,
      validate: {
        validator: (value) => {
          return (
            typeof value === "string" &&
            Buffer.byteLength(value, "utf8") <= 1024 * 1024
          );
        },
        message: "Source text must not exceed 1 MiB.",
      },
      immutable: true,
    },

    document: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: {
        validator: (value) => {
          return (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
          );
        },
        message: "The parsed specification must be an object.",
      },
      immutable: true,
    },

    contentHash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/u,
      immutable: true,
    },

    operationCount: {
      type: Number,
      required: true,
      min: 0,
      max: 500,
      validate: Number.isInteger,
      immutable: true,
    },

    parseStatus: {
      type: String,
      required: true,
      enum: ["VALID", "INVALID", "UNSUPPORTED_VERSION"],
      default: "VALID",
      immutable: true,
    },

    // Parser diagnostics are separate from explorer coverage.
    warnings: {
      type: [warningSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= 100,
        message: "A maximum of 100 parser warnings is allowed.",
      },
      immutable: true,
    },

    // Whether the current API Explorer covers the relevant
    // constructs found in this uploaded specification.
    explorerCompleteness: {
      type: String,
      required: true,
      enum: ["COMPLETE", "PARTIAL"],
      default: "PARTIAL",
      immutable: true,
    },

    // Explicit diagnostics for constructs not represented by
    // the current explorer implementation.
    explorerWarnings: {
      type: [warningSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= 100,
        message: "A maximum of 100 explorer warnings is allowed.",
      },
      immutable: true,
    },
  },
  {
    collection: "specversions",
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
    versionKey: false,
    minimize: false,
    strict: "throw",
    autoIndex: process.env.NODE_ENV !== "production",
  }
);

// List a project's specification versions newest first.
specVersionSchema.index(
  {
    projectId: 1,
    createdAt: -1,
  },
  {
    name: "idx_specversions_project_created",
  }
);

// Prevent the same specification content from being uploaded twice
// to the same project.
specVersionSchema.index(
  {
    projectId: 1,
    contentHash: 1,
  },
  {
    unique: true,
    name: "uniq_specversions_project_hash",
  }
);

// Keep version labels unique within each project.
specVersionSchema.index(
  {
    projectId: 1,
    label: 1,
  },
  {
    unique: true,
    name: "uniq_specversions_project_label",
  }
);

// Specification versions are immutable after initial creation.
specVersionSchema.pre("save", function () {
  if (!this.isNew) {
    throw new Error("Specification versions are immutable.");
  }
});

const immutableUpdateMethods = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
];

for (const method of immutableUpdateMethods) {
  specVersionSchema.pre(method, function () {
    throw new Error("Specification versions are immutable.");
  });
}

const SpecVersion =
  mongoose.models.SpecVersion ||
  mongoose.model("SpecVersion", specVersionSchema);

export default SpecVersion;
