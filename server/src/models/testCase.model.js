
import mongoose from "mongoose";

const MAX_REQUEST_ENTRIES = 20;
const MAX_ASSERTIONS = 40;

const requestSchema = new mongoose.Schema(
  {
    pathParams: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
    queryParams: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const propertyAssertionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["VALUE", "PRESENCE"],
    },
    path: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    present: {
      type: Boolean,
      default: undefined,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const assertionsSchema = new mongoose.Schema(
  {
    expectedStatus: {
      type: Number,
      min: 100,
      max: 599,
      validate: Number.isInteger,
      default: undefined,
    },
    propertyAssertions: {
      type: [propertyAssertionSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= MAX_ASSERTIONS,
        message: `At most ${MAX_ASSERTIONS} property assertions are allowed.`,
      },
    },
    requiredProperties: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 300,
        },
      ],
      default: [],
      validate: {
        validator: (value) => value.length <= MAX_ASSERTIONS,
        message: `At most ${MAX_ASSERTIONS} required properties are allowed.`,
      },
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const generationMetadataSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    model: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    generatedAt: Date,
    contextVersion: {
      type: String,
      trim: true,
      maxlength: 80,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const testCaseSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      immutable: true,
    },
    specVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SpecVersion",
      required: true,
      immutable: true,
    },
    operationKey: {
      type: String,
      required: true,
      trim: true,
      match: /^op_[A-Za-z0-9_-]{43}$/u,
      maxlength: 80,
      immutable: true,
    },
    operationPath: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
      immutable: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    source: {
      type: String,
      required: true,
      enum: ["MANUAL", "AI"],
      default: "MANUAL",
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["DRAFT", "APPROVED", "ARCHIVED"],
      default: "DRAFT",
    },
    request: {
      type: requestSchema,
      required: true,
      default: () => ({}),
    },
    assertions: {
      type: assertionsSchema,
      required: true,
      default: () => ({}),
    },
    generationMetadata: {
      type: generationMetadataSchema,
      default: undefined,
      immutable: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "testcases",
    timestamps: true,
    versionKey: false,
    minimize: false,
    strict: "throw",
    autoIndex: process.env.NODE_ENV !== "production",
  }
);

testCaseSchema.pre("validate", function () {
  const pathCount = this.request?.pathParams?.size ?? 0;
  const queryCount = this.request?.queryParams?.size ?? 0;

  if (pathCount + queryCount > MAX_REQUEST_ENTRIES) {
    this.invalidate(
      "request",
      `At most ${MAX_REQUEST_ENTRIES} path and query inputs are allowed.`,
      this.request
    );
  }

  for (const [index, assertion] of (this.assertions?.propertyAssertions ?? []).entries()) {
    if (assertion.type === "VALUE" && assertion.value === undefined) {
      this.invalidate(
        `assertions.propertyAssertions.${index}.value`,
        "A VALUE assertion requires a value."
      );
    }

    if (assertion.type === "PRESENCE" && typeof assertion.present !== "boolean") {
      this.invalidate(
        `assertions.propertyAssertions.${index}.present`,
        "A PRESENCE assertion requires a boolean present value."
      );
    }
  }
});

testCaseSchema.index(
  { projectId: 1, specVersionId: 1, status: 1, createdAt: -1 },
  { name: "idx_testcases_project_version_status_created" }
);

testCaseSchema.index(
  { projectId: 1, specVersionId: 1, operationKey: 1 },
  { name: "idx_testcases_project_version_operation" }
);

const TestCase = mongoose.models.TestCase ||
  mongoose.model("TestCase", testCaseSchema);

export default TestCase;
