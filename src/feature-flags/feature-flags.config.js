/**
 * @returns {import('./feature-flags.port.js').FeatureFlags}
 */
export const createConfigFeatureFlags = (config) => ({
  isDevEndpointsEnabled() {
    return config.get('featureFlags.devEndpoints')
  },
  isPreCpaResubmissionBackfillEnabled() {
    return config.get('featureFlags.preCpaResubmissionBackfill')
  },
  isPreCpaResubmissionReportEnabled() {
    return config.get('featureFlags.preCpaResubmissionReport')
  },
  isStaleIssuedTonnageReportEnabled() {
    return config.get('featureFlags.staleIssuedTonnageReport')
  },
  isReportDataValidationEnabled() {
    return config.get('featureFlags.reportDataValidation')
  },
  isReportDataCompleteDiagnosticEnabled() {
    return config.get('featureFlags.reportDataCompleteDiagnostic')
  },
  isPrnAdminCancellationEnabled() {
    return config.get('featureFlags.prnAdminCancellation')
  }
})
