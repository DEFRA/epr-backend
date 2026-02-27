/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createInMemoryFeatureFlags = (flags = {}) => ({
  isFormsDataMigrationEnabled() {
    return flags.formsDataMigration ?? false
  },
  isDevEndpointsEnabled() {
    return flags.devEndpoints ?? false
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
