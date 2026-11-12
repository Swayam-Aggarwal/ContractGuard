import testRunService from "../services/testRun.service.js";

const createTestRunController = () => ({
  listTestRuns: async (req, res) => {
    const result = await testRunService.listTestRuns(
      req.user.id,
      req.authorizedProjectId,
      req.validatedParams.reportId
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  },

  createTestRun: async (req, res) => {
    const testRun = await testRunService.createTestRun(
      req.user.id,
      req.authorizedProjectId,
      req.validatedParams.reportId,
      req.body
    );

    return res.status(202).json({
      success: true,
      data: { testRun },
    });
  },

  getTestRun: async (req, res) => {
    const testRun = await testRunService.getTestRun(
      req.user.id,
      req.authorizedProjectId,
      req.validatedParams.reportId,
      req.validatedParams.testRunId
    );

    return res.status(200).json({
      success: true,
      data: { testRun },
    });
  },
});

export default createTestRunController;