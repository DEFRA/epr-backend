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
  isSummaryLogRowStatesEnabled() {
    return config.get('featureFlags.summaryLogRowStates')
  },
  isSummaryLogRowStatesBackfillEnabled() {
    return config.get('featureFlags.summaryLogRowStatesBackfill')
  },
  isSummaryLogRowStatesDiscrepancyReportEnabled() {
    return config.get('featureFlags.summaryLogRowStatesDiscrepancyReport')
  },
  isRegisteredOnlySubmittedEventsEnabled() {
    return config.get('featureFlags.registeredOnlySubmittedEvents')
  }
})
