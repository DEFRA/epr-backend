/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isClosedPeriodAdjustmentsEnabled
 * @property {() => boolean} isCopyFormFilesToS3Enabled
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isFixDuplicateAccreditationLinksEnabled
 * @property {() => boolean} isWasteRecordStatesEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [closedPeriodAdjustments]
 * @property {boolean} [copyFormFilesToS3]
 * @property {boolean} [devEndpoints]
 * @property {boolean} [fixDuplicateAccreditationLinks]
 * @property {boolean} [wasteRecordStates]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
