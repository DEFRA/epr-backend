/**
 * @param {import('./feature-flags.port.js').FeatureFlagOverrides} [flags]
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createInMemoryFeatureFlags = (flags = {}) => ({
  isDevEndpointsEnabled() {
    return flags.devEndpoints ?? false
  },
  isFixDuplicateAccreditationLinksEnabled() {
    return flags.fixDuplicateAccreditationLinks ?? false
  },
  isSummaryLogRowStatesEnabled() {
    return flags.summaryLogRowStates ?? false
  },
  isRegisteredOnlySubmittedEventsEnabled() {
    return flags.registeredOnlySubmittedEvents ?? false
  },
  isStaleIssuedTonnageReportEnabled() {
    return flags.staleIssuedTonnageReport ?? false
  }
})
