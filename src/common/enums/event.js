export const LOGGING_EVENT_CATEGORIES = {
  AUTH: 'authentication',
  CONFIG: 'configuration',
  DB: 'database',
  HTTP: 'http',
  PROXY: 'proxy',
  SECRET: 'secret',
  SERVER: 'server'
}

export const LOGGING_EVENT_ACTIONS = {
  AUTH_FAILED: 'auth_failed',
  LOCK_ACQUISITION_FAILED: 'lock_acquisition_failed',
  CONNECTION_FAILURE: 'connection_failure',
  CONNECTION_INITIALISING: 'connection_initialising',
  CONNECTION_CLOSING: 'connection_closing',
  CONNECTION_CLOSING_FAILURE: 'connection_closing_failure',
  CONNECTION_CLOSING_SUCCESS: 'connection_closing_success',
  CONNECTION_SUCCESS: 'connection_success',
  NOT_FOUND: 'env_var_not_found',
  READ_ERROR: 'read_error',
  PROXY_INITIALISING: 'proxy_initialising',
  REQUEST_SUCCESS: 'request_success',
  REQUEST_FAILURE: 'request_failure',
  RESPONSE_SUCCESS: 'response_success',
  RESPONSE_FAILURE: 'response_failure',
  SEND_EMAIL_FAILURE: 'send_email_failure',
  START_FAILURE: 'start_failure',
  START_SUCCESS: 'start_success',
  PROCESS_FAILURE: 'process_failure',
  PROCESS_SUCCESS: 'process_success',
  VERSION_CONFLICT_DETECTED: 'version_conflict_detected',
  WATERMARK_REGRESSION_DETECTED: 'watermark_regression_detected',
  DATA_MIGRATION_FAILURE: 'data_migration_failure',
  SUMMARY_LOG_SUPERSEDED: 'summary_log_superseded',
  SUMMARY_LOG_VALIDATION_ISSUE: 'summary_log_validation_issue',
  SUMMARY_LOG_VALIDATION_COMPLETED: 'summary_log_validation_completed',
  COMPENSATION_FAILURE: 'compensation_failure',
  COMPENSATION_SUCCESS: 'compensation_success',
  WASTE_BALANCE_UPDATED: 'waste_balance_updated',
  REPORT_RESPONSE_SCHEMA_VIOLATION: 'report_response_schema_violation',
  LEGACY_STALE_SHAPE_NORMALISED: 'legacy_stale_shape_normalised',
  UNEXPORTED_TONNAGE_MISMATCH: 'unexported_tonnage_mismatch',
  UNEXPORTED_TONNAGE_SOURCE_MISSING: 'unexported_tonnage_source_missing',
  UNEXPORTED_TONNAGE_RECOMPUTE_FAILED: 'unexported_tonnage_recompute_failed',
  UNEXPORTED_TONNAGE_LOOKUP_FAILED: 'unexported_tonnage_lookup_failed',
  UNEXPORTED_TONNAGE_BY_MONTH: 'unexported_tonnage_by_month',
  UNEXPORTED_TONNAGE_BY_STATUS: 'unexported_tonnage_by_status',
  UNEXPORTED_TONNAGE_LARGEST_DELTAS: 'unexported_tonnage_largest_deltas',
  UNEXPORTED_TONNAGE_SUMMARY: 'unexported_tonnage_summary',
  OVER_EXPORTED_LOADS_FINDING: 'over_exported_loads_finding',
  OVER_EXPORTED_LOADS_BY_MATERIAL: 'over_exported_loads_by_material',
  OVER_EXPORTED_LOADS_BY_MONTH: 'over_exported_loads_by_month',
  OVER_EXPORTED_LOADS_LARGEST: 'over_exported_loads_largest',
  OVER_EXPORTED_LOADS_SUMMARY: 'over_exported_loads_summary'
}

export const AUDIT_EVENT_CATEGORIES = {
  EMAIL: 'email',
  DB: 'database'
}

export const AUDIT_EVENT_ACTIONS = {
  EMAIL_SENT: 'email_sent',
  DB_INSERT: 'database_insert'
}
