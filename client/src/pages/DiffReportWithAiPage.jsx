import {
  useState,
} from "react";

import {
  useParams,
} from "react-router";

import {
  Sparkles,
} from "lucide-react";

import DiffReportPage from "./DiffReportPage.jsx";

import AiTestSuggestionsDialog from
  "../components/AiTestSuggestionsDialog.jsx";

import "./DiffReportWithAiPage.css";

const DiffReportWithAiPage = () => {
  const {
    projectId,
    reportId,
  } = useParams();

  const [dialogOpen, setDialogOpen] =
    useState(false);

  return (
    <>
      <DiffReportPage />

      <div className="ai-suggestions-launcher">
        <button
          type="button"
          className="button button-primary"
          onClick={() => setDialogOpen(true)}
          aria-haspopup="dialog"
        >
          <Sparkles size={16} />

          Suggest tests with AI
        </button>
      </div>

      {dialogOpen && (
        <AiTestSuggestionsDialog
          projectId={projectId}
          reportId={reportId}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
};

export default DiffReportWithAiPage;