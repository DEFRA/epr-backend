/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createConfigFeatureFlags = (config) => ({
  isClosedPeriodAdjustmentsEnabled() {
    return config.get('featureFlags.closedPeriodAdjustments')
  },
  isCopyFormFilesToS3Enabled() {
    return config.get('featureFlags.copyFormFilesToS3')
  },
  isDevEndpointsEnabled() {
    return config.get('featureFlags.devEndpoints')
  },
  isFixDuplicateAccreditationLinksEnabled() {
    return config.get('featureFlags.fixDuplicateAccreditationLinks')
  },
  isWasteRecordStatesEnabled() {
    return config.get('featureFlags.wasteRecordStates')
  }
})
