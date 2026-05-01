export const featureFlagsSchema = {
  devEndpoints: {
    doc: 'Feature Flag: Enable development endpoints',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_DEV_ENDPOINTS'
  },
  copyFormFilesToS3: {
    doc: 'Feature Flag: Copy form files to S3 on startup',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_COPY_FORM_FILES_TO_S3'
  },
  reports: {
    doc: 'Feature Flag: Enable reports',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_REPORTS'
  },
  orsWasteBalanceValidation: {
    doc: 'Feature Flag: Validate ORS approval status during exporter waste balance classification',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_ORS_WASTE_BALANCE_VALIDATION'
  },
  allowFullErrorOutput: {
    doc: 'Feature Flag: Allow full error output (including potentially sensitive payload / stack detail)',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_ALLOW_FULL_ERROR_OUTPUT'
  },
  wasteBalanceLedger: {
    doc: 'Feature Flag: Write and read waste balance transactions via the append-only ledger collection (ADR 0031)',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_WASTE_BALANCE_LEDGER'
  },
  registrationContactsMigration: {
    doc: 'Feature Flag: Re-migrate existing registrations to fix contact details and add applicationContactDetails',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_REGISTRATION_CONTACTS_MIGRATION'
  },
  reportUnsubmit: {
    doc: 'Feature Flag: Enable admin unsubmit endpoint for reports',
    format: Boolean,
    default: false,
    env: 'FEATURE_FLAG_REPORT_UNSUBMIT'
  }
}
