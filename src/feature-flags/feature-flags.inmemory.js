/**
 * @param {import('./feature-flags.port.js').FeatureFlagOverrides} [flags]
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createInMemoryFeatureFlags = (flags = {}) => ({
  isDevEndpointsEnabled() {
    return flags.devEndpoints ?? false
  },
  isPreCpaResubmissionBackfillEnabled() {
    return flags.preCpaResubmissionBackfill ?? false
  },
  isPreCpaResubmissionReportEnabled() {
    return flags.preCpaResubmissionReport ?? false
  },
  isStaleIssuedTonnageReportEnabled() {
    return flags.staleIssuedTonnageReport ?? false
  },
  isExporterReportDataValidationEnabled() {
    return flags.exporterReportDataValidation ?? false
  }
})
