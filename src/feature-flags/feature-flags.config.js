/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createConfigFeatureFlags = (config) => ({
  isSummaryLogsEnabled() {
    return config.get('featureFlags.summaryLogs')
  }
})
