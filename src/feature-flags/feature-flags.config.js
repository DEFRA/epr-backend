/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createConfigFeatureFlags = (config) => ({
  isFormsDataMigrationEnabled() {
    return config.get('featureFlags.formsDataMigration')
  },
  isLogFileUploadsFromFormsEnabled() {
    return config.get('featureFlags.logFileUploadsFromForms')
  },
  isDevEndpointsEnabled() {
    return config.get('featureFlags.devEndpoints')
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
