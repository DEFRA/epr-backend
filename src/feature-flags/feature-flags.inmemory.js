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
  isReportsEnabled() {
    return flags.reports ?? false
  },
  isRegisteredOnlyEnabled() {
    return flags.registeredOnly ?? false
  }
})
