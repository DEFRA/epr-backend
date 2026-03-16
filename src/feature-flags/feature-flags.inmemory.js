/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createInMemoryFeatureFlags = (flags = {}) => ({
  isFormsDataMigrationEnabled() {
    return flags.formsDataMigration ?? false
  },
  isCopyFormFilesToS3Enabled() {
    return flags.copyFormFilesToS3 ?? false
  },
  isDevEndpointsEnabled() {
    return flags.devEndpoints ?? false
  },
  isOverseasSitesEnabled() {
    return flags.overseasSites ?? false
  },
  isReportsEnabled() {
    return flags.reports ?? false
  },
  isRegisteredOnlyEnabled() {
    return flags.registeredOnly ?? false
  }
})
