import mongoose from "mongoose";

const MAX_REPORT_CHANGES = 2000;

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

    changeId: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/u,
      immutable: true,
    },

    ruleId: {
      type: String,
      default: null,
      maxlength: 20,
      validate: {
        validator: (value) =>
          value === null ||
          /^(?:OP|PAR|REQ|RES|SEC|SRV|SCH)-\d{3}$/u.test(value),

        message:
          "Rule ID must use a documented compatibility-rule prefix and number.",
      },
      immutable: true,
    },

    classification: {
      type: String,
      required: true,
      enum: [
        "BREAKING",
        "POTENTIALLY_BREAKING",
        "NON_BREAKING",
        "INFORMATIONAL",
        "UNSUPPORTED",
      ],
      immutable: true,
    },

    // Retained for existing clients while they migrate to classification.
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

    // Document-level findings may not belong to a particular API path.
    path: {
      type: String,
      default: null,
      maxlength: 1000,
      immutable: true,
    },

    operationKey: {
      type: String,
      default: null,
      maxlength: 2000,
      immutable: true,
    },

    affectedOperationKeys: {
      type: [
        {
          type: String,
          maxlength: 2000,
        },
      ],
      default: [],
      immutable: true,
    },

    jsonPointer: {
      type: String,
      default: null,
      maxlength: 2000,
      immutable: true,
    },

    summary: {
      type: String,
      required: true,
      maxlength: 2000,
      immutable: true,
    },

    rationale: {
      type: String,
      required: true,
      maxlength: 2000,
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

    breaking: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    potentiallyBreaking: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    nonBreaking: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    informational: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    unsupported: {
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

    // Canonical report-contract references.
    baselineVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SpecVersion",
      required: true,
      immutable: true,
    },

    candidateVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SpecVersion",
      required: true,
      immutable: true,
    },

    // Legacy Phase 4 references retained for historical compatibility.
    baselineSpecVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SpecVersion",
      immutable: true,
    },

    candidateSpecVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SpecVersion",
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
      default: "2.0.2",
      immutable: true,
    },

    direction: {
      type: String,
      required: true,
      enum: ["BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER"],
      default: "BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER",
      immutable: true,
    },

    rulesetVersion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
      default: "CG-COMPAT-1.1",
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
      enum: ["COMPLETE", "PARTIAL", "FAILED"],
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
        validator: (value) => value.length <= MAX_REPORT_CHANGES,
        message: `A maximum of ${MAX_REPORT_CHANGES} changes is allowed.`,
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

// Reject oversized reports before Mongoose validates individual
// change subdocuments. This avoids unnecessary nested validation.
diffReportSchema.pre("validate", function () {
  if (
    Array.isArray(this.changes) &&
    this.changes.length > MAX_REPORT_CHANGES
  ) {
    throw this.invalidate(
      "changes",
      `A maximum of ${MAX_REPORT_CHANGES} changes is allowed.`,
      this.changes.length,
      "user defined"
    );
  }
});

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
    baselineVersionId: 1,
    candidateVersionId: 1,
    rulesetVersion: 1,
  },
  {
    name: "idx_diffreports_version_pair_ruleset",
  }
);

// Retained for compatibility with older Phase 4 report queries.
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