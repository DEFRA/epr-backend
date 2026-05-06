/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isCopyFormFilesToS3Enabled
 * @property {() => boolean} isOrsWasteBalanceValidationEnabled
 * @property {() => boolean} isWasteBalanceLedgerEnabled
 * @property {() => boolean} isReportUnsubmitEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [copyFormFilesToS3]
 * @property {boolean} [orsWasteBalanceValidation]
 * @property {boolean} [wasteBalanceLedger]
 * @property {boolean} [reportUnsubmit]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
