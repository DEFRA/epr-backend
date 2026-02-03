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
  isCalculateWasteBalanceOnImportEnabled() {
    return flags.calculateWasteBalanceOnImport ?? false
  },
  getGlassMigrationMode() {
    return flags.glassMigration ?? 'disabled'
  },
  isCreatePackagingRecyclingNotesEnabled() {
    return flags.createPackagingRecyclingNotes ?? false
  },
  isCreateLumpyPackagingRecyclingNotesEnabled() {
    return flags.lumpyPackagingRecyclingNotes ?? false
  }
})
