import mongoose from "mongoose";

const MAX_TEST_CASES_PER_RUN = 20;
const MAX_RESULTS_PER_RUN = 20;
const MAX_DIAGNOSTICS = 50;

const validationDiagnosticSchema = new mongoose.Schema(
  {
    keyword: {
      type: String,
      maxlength: 100,
      default: "validation",
    },
    instancePath: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    schemaPath: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    message: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const schemaValidationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["READY", "PARTIAL", "UNSUPPORTED", "NOT_CHECKED"],
      required: true,
    },
    valid: {
      type: Boolean,
      default: null,
    },
    validationErrors: {
      type: [validationDiagnosticSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= MAX_DIAGNOSTICS,
        message: `At most ${MAX_DIAGNOSTICS} validation diagnostics are allowed.`,
      },
    },
    warnings: {
      type: [validationDiagnosticSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= MAX_DIAGNOSTICS,
        message: `At most ${MAX_DIAGNOSTICS} validation warnings are allowed.`,
      },
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const assertionOutcomeSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      required: true,
      enum: [
        "EXPECTED_STATUS",
        "REQUIRED_PROPERTY",
        "VALUE",
        "PRESENCE",
      ],
    },
    path: {
      type: String,
      maxlength: 300,
      default: null,
    },
    passed: {
      type: Boolean,
      required: true,
    },
    expected: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    actual: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const testCaseSnapshotSchema = new mongoose.Schema(
  {
    testCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestCase",
      required: true,
      immutable: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 120,
      immutable: true,
    },
    operationKey: {
      type: String,
      required: true,
      match: /^op_[A-Za-z0-9_-]{43}$/u,
      maxlength: 80,
      immutable: true,
    },
    operationPath: {
      type: String,
      required: true,
      maxlength: 1000,
      immutable: true,
    },
    request: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
    assertions: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const testResultSchema = new mongoose.Schema(
  {
    testCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestCase",
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 120,
    },
    operationKey: {
      type: String,
      required: true,
      match: /^op_[A-Za-z0-9_-]{43}$/u,
      maxlength: 80,
    },
    operationPath: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      required: true,
      enum: ["PASSED", "FAILED", "SKIPPED", "UNSUPPORTED", "ERROR"],
    },
    expectedStatus: {
      type: Number,
      min: 100,
      max: 599,
      default: null,
    },
    actualStatus: {
      type: Number,
      min: 100,
      max: 599,
      default: null,
    },
    contentType: {
      type: String,
      maxlength: 120,
      default: null,
    },
    durationMs: {
      type: Number,
      min: 0,
      max: 60000,
      default: 0,
    },
    candidateSchemaValidation: {
      type: schemaValidationSchema,
      default: () => ({
        status: "NOT_CHECKED",
        valid: null,
      }),
    },
    baselineSchemaValidation: {
      type: schemaValidationSchema,
      default: () => ({
        status: "NOT_CHECKED",
        valid: null,
      }),
    },
    assertions: {
      type: [assertionOutcomeSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= 50,
        message: "A maximum of 50 assertion outcomes is allowed per test result.",
      },
    },
    responseBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    responsePreview: {
      type: String,
      maxlength: 16384,
      default: "",
    },
    responseBodyTruncated: {
      type: Boolean,
      default: false,
    },
    errorCode: {
      type: String,
      maxlength: 100,
      default: null,
    },
    errorMessage: {
      type: String,
      maxlength: 1000,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const summarySchema = new mongoose.Schema(
  {
    total: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_TEST_CASES_PER_RUN,
      default: 0,
    },
    passed: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    failed: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    skipped: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    unsupported: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    errorCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const executionTargetSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["BUNDLED_DEMO_STORE"],
      immutable: true,
    },
    fixtureId: {
      type: String,
      required: true,
      enum: ["DEMO_STORE_V2"],
      immutable: true,
    },
    implementationVersion: {
      type: String,
      required: true,
      enum: ["DEMO_STORE_V2"],
      immutable: true,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  }
);

const testRunSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      immutable: true,
    },
    comparisonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiffReport",
      required: true,
      immutable: true,
    },
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
    direction: {
      type: String,
      required: true,
      enum: ["BASELINE_CONSUMER_TO_CANDIDATE_PROVIDER"],
      immutable: true,
    },
    rulesetVersion: {
      type: String,
      required: true,
      maxlength: 40,
      immutable: true,
    },
    executionTarget: {
      type: executionTargetSchema,
      required: true,
      immutable: true,
    },
    selectedTestCaseIds: {
      type: [mongoose.Schema.Types.ObjectId],
      required: true,
      immutable: true,
      validate: {
        validator: (value) =>
          value.length >= 1 &&
          value.length <= MAX_TEST_CASES_PER_RUN &&
          new Set(value.map(String)).size === value.length,
        message: `A run must contain between 1 and ${MAX_TEST_CASES_PER_RUN} unique test cases.`,
      },
    },
    testCaseSnapshots: {
      type: [testCaseSnapshotSchema],
      required: true,
      immutable: true,
      validate: {
        validator: (value) =>
          value.length >= 1 &&
          value.length <= MAX_TEST_CASES_PER_RUN,
        message: `A run must snapshot between 1 and ${MAX_TEST_CASES_PER_RUN} test cases.`,
      },
    },
    status: {
      type: String,
      required: true,
      enum: [
        "QUEUED",
        "RUNNING",
        "PASSED",
        "FAILED",
        "PARTIAL",
        "INTERRUPTED",
      ],
      default: "QUEUED",
    },
    summary: {
      type: summarySchema,
      required: true,
      default: () => ({ total: 0 }),
    },
    results: {
      type: [testResultSchema],
      default: [],
      validate: {
        validator: (value) =>
          value.length <= MAX_RESULTS_PER_RUN,
        message: `A maximum of ${MAX_RESULTS_PER_RUN} test results is allowed per run.`,
      },
    },
    failureReason: {
      type: String,
      maxlength: 1000,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "testruns",
    timestamps: true,
    versionKey: false,
    minimize: false,
    strict: "throw",
    autoIndex: process.env.NODE_ENV !== "production",
  }
);

testRunSchema.pre("validate", function () {
  const selectedIds = Array.isArray(this.selectedTestCaseIds)
    ? this.selectedTestCaseIds.map(String)
    : [];

  const snapshots = Array.isArray(this.testCaseSnapshots)
    ? this.testCaseSnapshots
    : [];

  const results = Array.isArray(this.results)
    ? this.results
    : [];

  if (selectedIds.length !== snapshots.length) {
    this.invalidate(
      "testCaseSnapshots",
      "Every selected test case must have an immutable execution snapshot."
    );
  }

  if (
    selectedIds.length === snapshots.length &&
    snapshots.some(
      (snapshot, index) =>
        String(snapshot.testCaseId) !== selectedIds[index]
    )
  ) {
    this.invalidate(
      "testCaseSnapshots",
      "Execution snapshots must preserve the selected test-case order and identity."
    );
  }

  if (results.length > selectedIds.length) {
    this.invalidate(
      "results",
      "A run cannot contain more results than selected test cases."
    );
  }

  const resultIds = results.map(
    (result) => String(result.testCaseId)
  );

  if (new Set(resultIds).size !== resultIds.length) {
    this.invalidate(
      "results",
      "A test case can have only one result in a run."
    );
  }

  if (resultIds.some((id) => !selectedIds.includes(id))) {
    this.invalidate(
      "results",
      "Every result must belong to a selected test case."
    );
  }

  if (this.summary) {
    const counted =
      this.summary.passed +
      this.summary.failed +
      this.summary.skipped +
      this.summary.unsupported +
      this.summary.errorCount;

    if (this.summary.total !== selectedIds.length) {
      this.invalidate(
        "summary.total",
        "The run summary total must equal the number of selected test cases."
      );
    }

    if (counted > this.summary.total) {
      this.invalidate(
        "summary",
        "Run summary result counts cannot exceed the selected test-case count."
      );
    }

    if (
      ["PASSED", "FAILED", "PARTIAL"].includes(this.status) &&
      counted !== this.summary.total
    ) {
      this.invalidate(
        "summary",
        "A completed run must account for every selected test case."
      );
    }
  }
});

testRunSchema.index(
  { projectId: 1, comparisonId: 1, createdAt: -1 },
  { name: "idx_testruns_project_comparison_created" }
);

testRunSchema.index(
  { status: 1, createdAt: 1 },
  { name: "idx_testruns_status_created" }
);

testRunSchema.index(
  { ownerId: 1, projectId: 1, createdAt: -1 },
  { name: "idx_testruns_owner_project_created" }
);

const TestRun =
  mongoose.models.TestRun ||
  mongoose.model("TestRun", testRunSchema);

export default TestRun;