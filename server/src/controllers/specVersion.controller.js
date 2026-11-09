
import specVersionService from "../services/specVersion.service.js";

import specificationExplorerService from
  "../services/specification-explorer.service.js";

const toPublicWarnings = (warnings = []) => {
  return warnings.map((warning) => ({
    field: warning.field,
    message: warning.message,
  }));
};

const toPublicSpecificationDetail = (specVersion) => ({
  id: specVersion._id.toString(),
  projectId: specVersion.projectId.toString(),
  label: specVersion.label,
  openapiVersion: specVersion.openapiVersion,
  title: specVersion.title,
  sourceFormat: specVersion.sourceFormat,
  operationCount: specVersion.operationCount,
  parseStatus: specVersion.parseStatus,

  explorerCompleteness:
    specVersion.explorerCompleteness ?? "PARTIAL",

  warnings: toPublicWarnings(specVersion.warnings),
  explorerWarnings: toPublicWarnings(
    specVersion.explorerWarnings
  ),

  document: specVersion.document,
  createdAt: specVersion.createdAt,
});

const createSpecVersionController = () => {
  const uploadSpecification = async (req, res) => {
    const specification =
      await specVersionService.createSpecificationVersion(
        req.user.id,
        req.authorizedProjectId,
        {
          ...req.specificationUpload,
          label: req.body.label,
        }
      );

    return res.status(201).json({
      success: true,
      data: {
        specification,
      },
    });
  };

  const listSpecificationVersions = async (req, res) => {
    const specifications =
      await specVersionService.listSpecificationVersions(
        req.user.id,
        req.validatedParams.projectId
      );

    return res.status(200).json({
      success: true,
      data: {
        specifications,
      },
    });
  };

  const getSpecificationVersion = async (req, res) => {
    const specification =
      await specVersionService.getSpecificationVersionRecord(
        req.user.id,
        req.validatedParams.specVersionId
      );

    return res.status(200).json({
      success: true,
      data: {
        specification: toPublicSpecificationDetail(specification),
      },
    });
  };

  const listSpecificationOperations = async (req, res) => {
    const result =
      await specificationExplorerService.listSpecificationOperations(
        req.user.id,
        req.validatedParams.specVersionId
      );

    return res.status(200).json({
      success: true,
      data: result,
    });
  };

  const getSpecificationOperation = async (req, res) => {
    const result =
      await specificationExplorerService.getSpecificationOperation(
        req.user.id,
        req.validatedParams.specVersionId,
        req.validatedParams.operationKey
      );

    return res.status(200).json({
      success: true,
      data: result,
    });
  };

  const listSpecificationComponents = async (req, res) => {
    const result =
      await specificationExplorerService.listSpecificationComponents(
        req.user.id,
        req.validatedParams.specVersionId,
        req.validatedParams.componentType
      );

    return res.status(200).json({
      success: true,
      data: result,
    });
  };

  const getSpecificationComponent = async (req, res) => {
    const result =
      await specificationExplorerService.getSpecificationComponent(
        req.user.id,
        req.validatedParams.specVersionId,
        req.validatedParams.componentType,
        req.validatedParams.componentName
      );

    return res.status(200).json({
      success: true,
      data: result,
    });
  };

  const getSpecificationReference = async (req, res) => {
    const result =
      await specificationExplorerService.getSpecificationReference(
        req.user.id,
        req.validatedParams.specVersionId,
        req.validatedQuery.ref
      );

    return res.status(200).json({
      success: true,
      data: result,
    });
  };

  return {
    uploadSpecification,
    listSpecificationVersions,
    getSpecificationVersion,
    listSpecificationOperations,
    getSpecificationOperation,
    listSpecificationComponents,
    getSpecificationComponent,
    getSpecificationReference,
  };
};

export default createSpecVersionController;
