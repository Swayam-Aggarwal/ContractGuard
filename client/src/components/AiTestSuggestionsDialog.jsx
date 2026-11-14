
import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router";

import {
  useGenerateAiTestSuggestions,
} from "../features/aiTestSuggestions.js";

import "./AiTestSuggestionsDialog.css";

const OPERATION_OPTIONS = Object.freeze([
  {
    value: "listProducts",
    label: "List products",
    method: "GET",
    path: "/products",
    parameters:
      "Optional query parameter: limit (1–50)",
  },

  {
    value: "getProduct",
    label: "Get product by ID",
    method: "GET",
    path: "/products/{productId}",
    parameters:
      "Required path parameter: productId (1001, 1002, 1003, or 9999)",
  },
]);

const AiTestSuggestionsDialog = ({
  projectId,
  reportId,
  onClose,
}) => {
  const navigate = useNavigate();

  const [selectedOperationId, setSelectedOperationId] =
    useState("");

  const [consentAccepted, setConsentAccepted] =
    useState(false);

  const mutation = useGenerateAiTestSuggestions();

  const result = mutation.data ?? null;
  const isPending = mutation.isPending;

  const selectedOperation = OPERATION_OPTIONS.find(
    (operation) =>
      operation.value === selectedOperationId
  ) ?? null;

  const handleClose = () => {
    if (!isPending) {
      onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isPending) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [isPending, onClose]);

  const handleOperationChange = (event) => {
    setSelectedOperationId(event.target.value);

    /*
     * Consent is tied to one exact operation.
     * Changing the operation requires fresh consent.
     */
    setConsentAccepted(false);

    mutation.reset();
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (
      !selectedOperation ||
      !consentAccepted ||
      isPending
    ) {
      return;
    }

    mutation.mutate({
      projectId,
      reportId,
      operationId: selectedOperation.value,
    });
  };

  const handleViewDrafts = () => {
    if (!result?.specVersionId) {
      return;
    }

    navigate(
      `/projects/${encodeURIComponent(projectId)}` +
        `/specifications/${encodeURIComponent(result.specVersionId)}` +
        `/test-cases`
    );

    onClose();
  };

  const handleBackdropClick = (event) => {
    if (
      event.target === event.currentTarget &&
      !isPending
    ) {
      onClose();
    }
  };

  return (
    <div
      className="ai-suggestions-overlay"
      role="presentation"
      onMouseDown={handleBackdropClick}
    >
      <section
        className="ai-suggestions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-suggestions-title"
        aria-describedby="ai-suggestions-description"
      >
        <header className="ai-suggestions-header">
          <div>
            <span className="eyebrow">
              AI-ASSISTED TEST DESIGN
            </span>

            <h2 id="ai-suggestions-title">
              Suggest test cases
            </h2>

            <p id="ai-suggestions-description">
              Choose one trusted Demo Store operation
              to generate bounded test-case drafts.
            </p>
          </div>

          <button
            type="button"
            className="ai-suggestions-close"
            onClick={handleClose}
            disabled={isPending}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>

        {!result ? (
          <form
            className="ai-suggestions-form"
            onSubmit={handleSubmit}
          >
            <section className="ai-suggestions-scope">
              <h3>1. Select one operation</h3>

              <p>
                Only the operation selected here will be
                included in the Gemini request.
              </p>

              <div className="ai-suggestions-operation-picker">
                <label htmlFor="ai-suggestions-operation">
                  Demo Store operation
                </label>

                <select
                  id="ai-suggestions-operation"
                  className="ai-suggestions-operation-select"
                  value={selectedOperationId}
                  onChange={handleOperationChange}
                  disabled={isPending}
                  required
                >
                  <option value="">
                    Choose one operation
                  </option>

                  {OPERATION_OPTIONS.map((operation) => (
                    <option
                      key={operation.value}
                      value={operation.value}
                    >
                      {operation.label} — {operation.method}{" "}
                      {operation.path}
                    </option>
                  ))}
                </select>
              </div>

              {selectedOperation && (
                <div className="ai-suggestions-selected-operation">
                  <strong>Selected operation</strong>

                  <code>
                    {selectedOperation.method}{" "}
                    {selectedOperation.path}
                  </code>

                  <p>{selectedOperation.parameters}</p>
                </div>
              )}
            </section>

            <section className="ai-suggestions-scope">
              <h3>2. What will be sent</h3>

              <p>
                ContractGuard sends a bounded synthetic
                context from the trusted Demo Store V1
                to V2 fixture pair.
              </p>

              <div className="ai-suggestions-version-grid">
                <div>
                  <span>Baseline</span>
                  <strong>Demo Store V1 · 1.0.0</strong>
                </div>

                <div>
                  <span>Candidate</span>
                  <strong>Demo Store V2 · 2.0.0</strong>
                </div>
              </div>

              {selectedOperation && (
                <div className="ai-suggestions-operation-list">
                  <strong>Included operation</strong>

                  <code>
                    {selectedOperation.method}{" "}
                    {selectedOperation.path}
                  </code>
                </div>
              )}

              <p className="ai-suggestions-scope-footnote">
                The request also includes the trusted fixture
                identifiers and versions, the selected
                operation's permitted parameter names,
                and at most four short, sanitized
                compatibility findings matching that
                operation.
              </p>

              <p className="ai-suggestions-scope-footnote">
                It excludes original YAML or JSON files,
                complete OpenAPI documents, unselected
                operations, server URLs, security schemes,
                authentication headers, credentials,
                arbitrary user prompts, and production
                or customer data.
              </p>
            </section>

            <section className="ai-suggestions-privacy">
              <h3>3. Google Gemini data handling</h3>

              <p>
                ContractGuard uses the server-side Gemini
                API key. The request uses the Interactions
                API with <code>store: false</code>, which
                disables storage of the Interaction object.
              </p>

              <p>
                This setting does not change Google's
                separate data-use terms. Because this
                project uses the Free Tier, submitted
                prompts and responses may be used by Google
                to improve its products.
              </p>

              <p>
                The privacy restriction in ContractGuard
                limits the submitted context to the one
                selected synthetic Demo Store operation.
                Do not put private or production data
                into this demonstration context.
              </p>
            </section>

            <label className="ai-suggestions-consent">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) =>
                  setConsentAccepted(event.target.checked)
                }
                disabled={isPending || !selectedOperation}
              />

              <span>
                I understand that the bounded synthetic
                context for the selected operation will be
                sent to Google's Gemini API using the
                Free Tier, and I consent to this individual
                request.
              </span>
            </label>

            {mutation.error && (
              <p
                className="ai-suggestions-error"
                role="alert"
              >
                {mutation.error.message}
              </p>
            )}

            <footer className="ai-suggestions-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={handleClose}
                disabled={isPending}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="button button-primary"
                disabled={
                  !selectedOperation ||
                  !consentAccepted ||
                  isPending
                }
              >
                {isPending
                  ? "Generating drafts..."
                  : "Consent and generate"}
              </button>
            </footer>
          </form>
        ) : (
          <section className="ai-suggestions-success">
            <div className="ai-suggestions-success-mark">
              ✓
            </div>

            <h3>
              Test-case drafts created
            </h3>

            <p>
              ContractGuard created{" "}
              <strong>{result.createdCount}</strong>{" "}
              AI-generated draft test cases for{" "}
              <strong>
                {OPERATION_OPTIONS.find(
                  (operation) =>
                    operation.value === result.selectedOperationId
                )?.label ?? result.selectedOperationId}
              </strong>{" "}
              in the existing Test Case Library.
            </p>

            <p className="ai-suggestions-audit">
              Provider: {result.provider}
              <br />
              Model: {result.model}
              <br />
              Operation: {result.selectedOperationId}
              <br />
              Context: {result.contextVersion}
            </p>

            <button
              type="button"
              className="button button-primary"
              onClick={handleViewDrafts}
            >
              Review generated drafts
            </button>
          </section>
        )}
      </section>
    </div>
  );
};

export default AiTestSuggestionsDialog;
