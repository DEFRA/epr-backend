/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createConfigFeatureFlags = (config) => ({
  isSummaryLogsEnabled() {
    return config.get('featureFlags.summaryLogs')
  },
  isOrganisationRoutesEnabled() {
    return config.get('featureFlags.organisations')
  },
  isFormsDataMigrationEnabled() {
    return config.get('featureFlags.formsDataMigration')
  }
})
