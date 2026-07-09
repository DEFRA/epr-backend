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
  isSummaryLogRowStatesEnabled() {
    return config.get('featureFlags.summaryLogRowStates')
  },
  isRegisteredOnlySubmittedEventsEnabled() {
    return config.get('featureFlags.registeredOnlySubmittedEvents')
  },
  isStaleIssuedTonnageReportEnabled() {
    return config.get('featureFlags.staleIssuedTonnageReport')
  }
})
