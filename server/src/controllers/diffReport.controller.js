
import diffReportService from
  "../services/diffReport.service.js";

const createDiffReportController = () => {
  const createDiffReport = async (req, res) => {
    const result = await diffReportService.createDiffReport(
      req.user.id,
      req.authorizedProjectId,
      req.body
    );

    return res
      .status(result.reused ? 200 : 201)
      .json({
        success: true,
        data: {
          diffReport: result.report,
          reused: result.reused,
        },
      });
  };

  const listDiffReports = async (req, res) => {
    const diffReports =
      await diffReportService.listDiffReports(
        req.user.id,
        req.authorizedProjectId,
        req.validatedQuery.limit
      );

    return res.status(200).json({
      success: true,
      data: {
        diffReports,
      },
    });
  };

  const getDiffReport = async (req, res) => {
    const diffReport =
      await diffReportService.getDiffReport(
        req.user.id,
        req.authorizedProjectId,
        req.validatedParams.reportId
      );

    return res.status(200).json({
      success: true,
      data: {
        diffReport,
      },
    });
  };

  return {
    createDiffReport,
    listDiffReports,
    getDiffReport,
  };
};

export default createDiffReportController;
