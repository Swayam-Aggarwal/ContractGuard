
import testCaseService from "../services/testCase.service.js";

const createTestCaseController = () => ({
  listTestCases: async (req, res) => {
    const testCases = await testCaseService.listTestCases(
      req.user.id,
      req.validatedParams.specVersionId
    );

    return res.status(200).json({
      success: true,
      data: { testCases },
    });
  },

  createTestCase: async (req, res) => {
    const testCase = await testCaseService.createTestCase(
      req.user.id,
      req.validatedParams.specVersionId,
      req.body
    );

    return res.status(201).json({
      success: true,
      data: { testCase },
    });
  },

  getTestCase: async (req, res) => {
    const testCase = await testCaseService.getTestCase(
      req.user.id,
      req.validatedParams.testCaseId
    );

    return res.status(200).json({
      success: true,
      data: { testCase },
    });
  },

  updateTestCase: async (req, res) => {
    const testCase = await testCaseService.updateTestCase(
      req.user.id,
      req.validatedParams.testCaseId,
      req.body
    );

    return res.status(200).json({
      success: true,
      data: { testCase },
    });
  },

  approveTestCase: async (req, res) => {
    const testCase = await testCaseService.approveTestCase(
      req.user.id,
      req.validatedParams.testCaseId
    );

    return res.status(200).json({
      success: true,
      data: { testCase },
    });
  },

  archiveTestCase: async (req, res) => {
    const testCase = await testCaseService.archiveTestCase(
      req.user.id,
      req.validatedParams.testCaseId
    );

    return res.status(200).json({
      success: true,
      data: { testCase },
    });
  },
});

export default createTestCaseController;
