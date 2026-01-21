/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createConfigFeatureFlags = (config) => ({
  isSummaryLogsEnabled() {
    return config.get('featureFlags.summaryLogs')
  },
  isFormsDataMigrationEnabled() {
    return config.get('featureFlags.formsDataMigration')
  },
  isLogFileUploadsFromFormsEnabled() {
    return config.get('featureFlags.logFileUploadsFromForms')
  },
  isDevEndpointsEnabled() {
    return config.get('featureFlags.devEndpoints')
  },
  isCalculateWasteBalanceOnImportEnabled() {
    return config.get('featureFlags.calculateWasteBalanceOnImport')
  },
  getGlassMigrationMode() {
    const value = config.get('featureFlags.glassMigration')
    if (value === 'true') {
      return 'enabled'
    }
    if (value === 'dry-run') {
      return 'dry-run'
    }
    return 'disabled'
  }
})
