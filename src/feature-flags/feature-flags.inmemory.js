/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createInMemoryFeatureFlags = (flags = {}) => ({
  isSummaryLogsEnabled() {
    return flags.summaryLogs ?? false
  },
  isOrganisationRoutesEnabled() {
    return flags.organisations ?? false
  },
  isLogFileUploadsFromFormsEnabled() {
    return flags.logFileUploadsFromForms ?? false
  },
  isFormsDataMigrationEnabled() {
    return flags.formsDataMigration ?? false
  }
})
