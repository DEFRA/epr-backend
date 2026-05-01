/**
 * @typedef {Object} FeatureFlags
 * @property {() => boolean} isDevEndpointsEnabled
 * @property {() => boolean} isCopyFormFilesToS3Enabled
 * @property {() => boolean} isReportsEnabled
 * @property {() => boolean} isOrsWasteBalanceValidationEnabled
 * @property {() => boolean} isWasteBalanceLedgerEnabled
 * @property {() => boolean} isRegistrationContactsMigrationEnabled
 * @property {() => boolean} isReportUnsubmitEnabled
 */

/**
 * @typedef {Object} FeatureFlagOverrides
 * @property {boolean} [devEndpoints]
 * @property {boolean} [copyFormFilesToS3]
 * @property {boolean} [reports]
 * @property {boolean} [orsWasteBalanceValidation]
 * @property {boolean} [wasteBalanceLedger]
 * @property {boolean} [registrationContactsMigration]
 * @property {boolean} [reportUnsubmit]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
