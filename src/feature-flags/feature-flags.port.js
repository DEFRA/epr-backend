/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isPreCpaResubmissionBackfillEnabled
 * @property {() => boolean} isPreCpaResubmissionReportEnabled
 * @property {() => boolean} isStaleIssuedTonnageReportEnabled
 * @property {() => boolean} isExporterReportDataValidationEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [preCpaResubmissionBackfill]
 * @property {boolean} [preCpaResubmissionReport]
 * @property {boolean} [staleIssuedTonnageReport]
 * @property {boolean} [exporterReportDataValidation]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
