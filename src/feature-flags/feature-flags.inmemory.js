/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createInMemoryFeatureFlags = (flags = {}) => ({
  isSummaryLogsEnabled() {
    return flags.summaryLogs ?? false
  },
  isLogFileUploadsFromFormsEnabled() {
    return flags.logFileUploadsFromForms ?? false
  },
  isFormsDataMigrationEnabled() {
    return flags.formsDataMigration ?? false
  },
  isDevEndpointsEnabled() {
    return flags.devEndpoints ?? false
  },
  getGlassMigrationMode() {
    return flags.glassMigration ?? 'disabled'
  },
  isCreateLumpyPackagingRecyclingNotesEnabled() {
    return flags.lumpyPackagingRecyclingNotes ?? false
  }
})
