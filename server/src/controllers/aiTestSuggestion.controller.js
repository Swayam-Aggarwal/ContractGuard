
import aiTestSuggestionService from
  "../services/ai-test-suggestion.service.js";

const createAiTestSuggestionController = (config) => {
  const getPreview = async (req, res) => {
    const result =
      await aiTestSuggestionService.getAiTestSuggestionPreview({
        ownerId: req.user.id,
        projectId: req.authorizedProjectId,
        reportId: req.validatedParams.reportId,
        operationId: req.validatedQuery.operationId,
        config,
      });

    return res.status(200).json({
      success: true,

      data: {
        provider: result.provider,

        providerConfigured:
          result.providerConfigured,

        selectedOperation:
          result.selectedOperation,

        availableOperations:
          result.availableOperations,

        providerSubmissionPreview:
          result.providerSubmissionPreview,
      },
    });
  };

  const generateSuggestions = async (req, res) => {
    const result =
      await aiTestSuggestionService.generateAiTestSuggestions({
        ownerId: req.user.id,
        projectId: req.authorizedProjectId,
        reportId: req.validatedParams.reportId,

        // The selected operation is supplied by the user,
        // validated by Zod, and resolved against the baseline.
        operationId: req.body.operationId,

        consent: req.body.consent,
        config,
      });

    return res.status(201).json({
      success: true,

      data: {
        testCases: result.testCases,
        specVersionId: result.specVersionId,
        selectedOperationId:
          result.selectedOperationId,
        createdCount: result.createdCount,
        provider: result.provider,
        model: result.model,
        contextVersion: result.contextVersion,
      },
    });
  };

  return {
    getPreview,
    generateSuggestions,
  };
};

export default createAiTestSuggestionController;
