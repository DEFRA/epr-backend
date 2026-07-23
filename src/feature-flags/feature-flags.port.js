/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isStaleIssuedTonnageReportEnabled
 * @property {() => boolean} isPreCpaResubmissionReportEnabled
 * @property {() => boolean} isPreCpaResubmissionBackfillEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [staleIssuedTonnageReport]
 * @property {boolean} [preCpaResubmissionReport]
 * @property {boolean} [preCpaResubmissionBackfill]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
