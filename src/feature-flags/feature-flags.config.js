/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createConfigFeatureFlags = (config) => ({
  isFormsDataMigrationEnabled() {
    return config.get('featureFlags.formsDataMigration')
  },
  isDevEndpointsEnabled() {
    return config.get('featureFlags.devEndpoints')
  },
  isCreatePackagingRecyclingNotesEnabled() {
    return config.get('featureFlags.packagingRecyclingNotes')
  },
  isPackagingRecyclingNotesExternalApiEnabled() {
    return config.get('featureFlags.packagingRecyclingNotesExternalApi')
  },
  isCopyFormFilesToS3Enabled() {
    return config.get('featureFlags.copyFormFilesToS3')
  }
})
