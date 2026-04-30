/**
 * @param {import('./feature-flags.port.js').FeatureFlagOverrides} [flags]
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createInMemoryFeatureFlags = (flags = {}) => ({
  isCopyFormFilesToS3Enabled() {
    return flags.copyFormFilesToS3 ?? false
  },
  isDevEndpointsEnabled() {
    return flags.devEndpoints ?? false
  },
  isReportsEnabled() {
    return flags.reports ?? false
  },
  isOrsWasteBalanceValidationEnabled() {
    return flags.orsWasteBalanceValidation ?? false
  },
  isWasteBalanceLedgerEnabled() {
    return flags.wasteBalanceLedger ?? false
  }
})
