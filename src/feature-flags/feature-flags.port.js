/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isCopyFormFilesToS3Enabled
 * @property {() => boolean} isReportsEnabled
 * @property {() => boolean} isOrsWasteBalanceValidationEnabled
 * @property {() => boolean} isWasteBalanceLedgerEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [copyFormFilesToS3]
 * @property {boolean} [reports]
 * @property {boolean} [orsWasteBalanceValidation]
 * @property {boolean} [wasteBalanceLedger]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
