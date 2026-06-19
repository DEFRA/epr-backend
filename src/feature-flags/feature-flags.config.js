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
  isCommittedRowStatesEnabled() {
    return config.get('featureFlags.committedRowStates')
  }
})
