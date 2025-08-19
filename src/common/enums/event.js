export const LOGGING_EVENT_CATEGORIES = {
  CONFIG: 'configuration',
  DB: 'database',
  HTTP: 'http',
  PROXY: 'proxy',
  SECRET: 'secret',
  SERVER: 'server',
  API: 'api'
}

export const LOGGING_EVENT_ACTIONS = {
  LOCK_ACQUISITION_FAILED: 'lock_acquisition_failed',
  CONNECTION_FAILURE: 'connection_failure',
  CONNECTION_INITIALISING: 'connection_initialising',
  CONNECTION_CLOSING: 'connection_closing',
  CONNECTION_SUCCESS: 'connection_success',
  NOT_FOUND: 'env_var_not_found',
  READ_ERROR: 'read_error',
  PROXY_INITIALISING: 'proxy_initialising',
  REQUEST_SUCCESS: 'request_success',
  REQUEST_FAILURE: 'response_failure',
  RESPONSE_FAILURE: 'response_failure',
  SEND_EMAIL_FAILURE: 'send_email_failure',
  START_FAILURE: 'start_failure',
  START_SUCCESS: 'start_success'
}

export const AUDIT_EVENT_CATEGORIES = {
  EMAIL: 'email'
}

export const AUDIT_EVENT_ACTIONS = {
  EMAIL_SENT: 'email_sent'
}
