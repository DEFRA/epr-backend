/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createInMemoryFeatureFlags = (flags = {}) => ({
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
  isCreatePackagingRecyclingNotesEnabled() {
    return flags.packagingRecyclingNotes ?? false
  },
  isPackagingRecyclingNotesExternalApiEnabled() {
    return flags.packagingRecyclingNotesExternalApi ?? false
  },
  isOverseasSitesEnabled() {
    return flags.overseasSites ?? false
  }
})
