
import mongoose from "mongoose";

const analysisWarningSchema = new mongoose.Schema(
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

const changeSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: [
        "operation",
        "parameter",
        "requestBody",
        "response",
        "schema",
        "security",
        "server",
        "metadata",
      ],
      immutable: true,
    },

    changeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      immutable: true,
    },

    severity: {
      type: String,
      required: true,
      enum: ["BREAKING", "NON_BREAKING", "INFO"],
      immutable: true,
    },

    breaking: {
      type: Boolean,
      required: true,
      immutable: true,
    },

    method: {
      type: String,
      default: null,
      maxlength: 32,
      immutable: true,
    },

    path: {
      type: String,
      required: true,
      maxlength: 1000,
      immutable: true,
    },

    operationKey: {
      type: String,
      default: null,
      maxlength: 100,
      immutable: true,
    },

    field: {
      type: String,
      required: true,
      maxlength: 1000,
      immutable: true,
    },

    message: {
      type: String,
      required: true,
      maxlength: 2000,
      immutable: true,
    },

    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      immutable: true,
    },

    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      immutable: true,
    },

    baselinePointer: {
      type: String,
      default: null,
      maxlength: 2000,
      immutable: true,
    },

    candidatePointer: {
      type: String,
      default: null,
      maxlength: 2000,
      immutable: true,
    },
  },
  {
    _id: false,
    id: false,
  }
);

const summarySchema = new mongoose.Schema(
  {
    totalChanges: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    breakingChanges: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    nonBreakingChanges: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    informationalChanges: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    addedOperations: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    removedOperations: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    unchangedOperations: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },
  },
  {
    _id: false,
    id: false,
  }
);

const diffReportSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      immutable: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    baselineSpecVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SpecVersion",
      required: true,
      immutable: true,
    },

    candidateSpecVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SpecVersion",
      required: true,
      immutable: true,
    },

    baselineContentHash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/u,
      immutable: true,
    },

    candidateContentHash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/u,
      immutable: true,
    },

    baselineLabel: {
      type: String,
      required: true,
      maxlength: 80,
      immutable: true,
    },

    candidateLabel: {
      type: String,
      required: true,
      maxlength: 80,
      immutable: true,
    },

    analyzerVersion: {
      type: String,
      required: true,
      default: "1.0.0",
      immutable: true,
    },

    analysisFingerprint: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/u,
      immutable: true,
    },

    analysisStatus: {
      type: String,
      required: true,
      enum: ["COMPLETE", "PARTIAL"],
      default: "PARTIAL",
      immutable: true,
    },

    summary: {
      type: summarySchema,
      required: true,
      immutable: true,
    },

    changes: {
      type: [changeSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= 2000,
        message: "A maximum of 2000 changes is allowed.",
      },
      immutable: true,
    },

    warnings: {
      type: [analysisWarningSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= 100,
        message: "A maximum of 100 analysis warnings is allowed.",
      },
      immutable: true,
    },
  },
  {
    collection: "diffreports",
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

diffReportSchema.index(
  {
    projectId: 1,
    createdAt: -1,
  },
  {
    name: "idx_diffreports_project_created",
  }
);

diffReportSchema.index(
  {
    projectId: 1,
    analysisFingerprint: 1,
  },
  {
    unique: true,
    name: "uniq_diffreports_project_fingerprint",
  }
);

diffReportSchema.index(
  {
    baselineSpecVersionId: 1,
    candidateSpecVersionId: 1,
  },
  {
    name: "idx_diffreports_spec_versions",
  }
);

diffReportSchema.pre("save", function () {
  if (!this.isNew) {
    throw new Error("Comparison reports are immutable.");
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
  diffReportSchema.pre(method, function () {
    throw new Error("Comparison reports are immutable.");
  });
}

const DiffReport =
  mongoose.models.DiffReport ||
  mongoose.model("DiffReport", diffReportSchema);

export default DiffReport;
