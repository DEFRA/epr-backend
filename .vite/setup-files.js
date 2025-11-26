import { afterAll, beforeAll } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

const fetchMock = createFetchMock(vi)

// Explicitly set all test-required env vars before any modules are loaded
// This prevents leakage from dev/CI environments and ensures consistent test behavior
// These values match the defaults in src/config.js to avoid breaking tests
process.env.NODE_ENV = 'test'

// Auth
process.env.ADMIN_UI_ENTRA_CLIENT_ID = 'test'
process.env.DEFRA_ID_CLIENT_ID = 'frontend-audience-id'
process.env.ENTRA_OIDC_WELL_KNOWN_CONFIGURATION_URL =
  'https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007/v2.0/.well-known/openid-configuration'
process.env.DEFRA_ID_OIDC_WELL_KNOWN_URL =
  'https://dcidmtest.b2clogin.com/DCIDMTest.onmicrosoft.com/v2.0/.well-known/openid-configuration?p=B2C_1A_CUI_CPDEV_SIGNUPSIGNIN'

// Roles
process.env.SERVICE_MAINTAINER_EMAILS = '["me@example.com", "you@example.com"]'

// AWS - LocalStack test credentials
process.env.AWS_ACCESS_KEY_ID = 'test'
process.env.AWS_SECRET_ACCESS_KEY = 'test'
process.env.AWS_REGION = 'eu-west-2' // matches config.js default
process.env.S3_ENDPOINT = 'http://127.0.0.1:4566' // matches config.js default

// MongoDB
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017' // matches config.js default
process.env.MONGO_DATABASE = 'epr-backend' // matches config.js default

// Logging - explicitly disable for cleaner test output
process.env.LOG_ENABLED = 'false'
process.env.AUDIT_ENABLED = 'true'

// HTTP Proxy - not needed in tests
// process.env.HTTP_PROXY is intentionally not set (null in config.js)

// Feature flags - explicitly set to false for predictable test behavior
process.env.FEATURE_FLAG_SUMMARY_LOGS = 'false'
process.env.FEATURE_FLAG_FORMS_DATA_MIGRATION = 'false'
process.env.FEATURE_FLAG_LOG_FILE_UPLOADS_FROM_FORMS = 'false'
process.env.FEATURE_FLAG_DEFRA_ID_AUTH = 'false'

beforeAll(async () => {
  // Setup fetch mock
  fetchMock.enableMocks()
  global.fetch = fetchMock
  global.fetchMock = fetchMock
})

afterAll(async () => {
  fetchMock.disableMocks()
})
