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
  isCopyFormFilesToS3Enabled() {
    return config.get('featureFlags.copyFormFilesToS3')
  },
  isReportsEnabled() {
    return config.get('featureFlags.reports')
  }
})
