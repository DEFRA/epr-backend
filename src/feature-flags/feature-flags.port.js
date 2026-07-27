/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isStaleIssuedTonnageReportEnabled
 * @property {() => boolean} isPreCpaResubmissionReportEnabled
 * @property {() => boolean} isPreCpaResubmissionBackfillEnabled
 * @property {() => boolean} isDropWasteRecordsCollectionEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [staleIssuedTonnageReport]
 * @property {boolean} [preCpaResubmissionReport]
 * @property {boolean} [preCpaResubmissionBackfill]
 * @property {boolean} [dropWasteRecordsCollection]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
