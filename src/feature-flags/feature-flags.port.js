/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isOverExportedLoadsReportEnabled
 * @property {() => boolean} isPreCpaResubmissionBackfillEnabled
 * @property {() => boolean} isPreCpaResubmissionReportEnabled
 * @property {() => boolean} isStaleIssuedTonnageReportEnabled
 * @property {() => boolean} isUnexportedTonnageReportEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [overExportedLoadsReport]
 * @property {boolean} [preCpaResubmissionBackfill]
 * @property {boolean} [preCpaResubmissionReport]
 * @property {boolean} [staleIssuedTonnageReport]
 * @property {boolean} [unexportedTonnageReport]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
