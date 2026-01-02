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
  DATA_MIGRATION_FAILURE: 'data_migration_failure',
  SUMMARY_LOG_SUPERSEDED: 'summary_log_superseded'
}

export const AUDIT_EVENT_CATEGORIES = {
  EMAIL: 'email',
  DB: 'database'
}

export const AUDIT_EVENT_ACTIONS = {
  EMAIL_SENT: 'email_sent',
  DB_INSERT: 'database_insert'
}
