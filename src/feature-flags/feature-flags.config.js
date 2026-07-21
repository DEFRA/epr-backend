/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createConfigFeatureFlags = (config) => ({
  isDevEndpointsEnabled() {
    return config.get('featureFlags.devEndpoints')
  },
  isFixDuplicateAccreditationLinksEnabled() {
    return config.get('featureFlags.fixDuplicateAccreditationLinks')
  },
  isStaleIssuedTonnageReportEnabled() {
    return config.get('featureFlags.staleIssuedTonnageReport')
  },
  isPreCpaResubmissionReportEnabled() {
    return config.get('featureFlags.preCpaResubmissionReport')
  },
  isPreCpaResubmissionBackfillEnabled() {
    return config.get('featureFlags.preCpaResubmissionBackfill')
  }
})
