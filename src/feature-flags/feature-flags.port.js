/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isCopyFormFilesToS3Enabled
 * @property {() => boolean} isFixDuplicateAccreditationLinksEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [copyFormFilesToS3]
 * @property {boolean} [fixDuplicateAccreditationLinks]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
