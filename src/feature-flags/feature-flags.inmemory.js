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
  isFixDuplicateAccreditationLinksEnabled() {
    return flags.fixDuplicateAccreditationLinks ?? false
  },
  isCommittedRowStatesEnabled() {
    return flags.committedRowStates ?? false
  }
})
