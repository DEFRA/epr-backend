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
  isFixDuplicateAccreditationLinksEnabled() {
    return config.get('featureFlags.fixDuplicateAccreditationLinks')
  },
  isWasteRecordStatesEnabled() {
    return config.get('featureFlags.wasteRecordStates')
  },
  isRegisteredOnlyCommittedHeadsEnabled() {
    return config.get('featureFlags.registeredOnlyCommittedHeads')
  }
})
