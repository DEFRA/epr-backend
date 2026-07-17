/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isFixDuplicateAccreditationLinksEnabled
 * @property {() => boolean} isStaleIssuedTonnageReportEnabled
 * @property {() => boolean} isPreCpaResubmissionReportEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [fixDuplicateAccreditationLinks]
 * @property {boolean} [staleIssuedTonnageReport]
 * @property {boolean} [preCpaResubmissionReport]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
