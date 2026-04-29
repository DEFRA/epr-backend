/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createConfigFeatureFlags = (config) => ({
  isDevEndpointsEnabled() {
    return config.get('featureFlags.devEndpoints')
  },
  isCopyFormFilesToS3Enabled() {
    return config.get('featureFlags.copyFormFilesToS3')
  },
  isReportsEnabled() {
    return config.get('featureFlags.reports')
  },
  isOrsWasteBalanceValidationEnabled() {
    return config.get('featureFlags.orsWasteBalanceValidation')
  },
  isWasteBalanceLedgerEnabled() {
    return config.get('featureFlags.wasteBalanceLedger')
  },
  isMigrateFormSubmissionLineageEnabled() {
    return config.get('featureFlags.migrateFormSubmissionLineage')
  }
})
