/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isPreCpaResubmissionBackfillEnabled
 * @property {() => boolean} isPreCpaResubmissionReportEnabled
 * @property {() => boolean} isStaleIssuedTonnageReportEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [preCpaResubmissionBackfill]
 * @property {boolean} [preCpaResubmissionReport]
 * @property {boolean} [staleIssuedTonnageReport]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
