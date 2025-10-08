/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createInMemoryFeatureFlags = (flags = {}) => ({
  isSummaryLogsEnabled() {
    return flags.summaryLogs ?? false
  }
})
