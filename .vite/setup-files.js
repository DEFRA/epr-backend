import { afterAll, beforeAll } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

const fetchMock = createFetchMock(vi)

// Explicitly set all test-required env vars before any modules are loaded
// This prevents leakage from dev/CI environments and ensures consistent test behavior
// These values match the defaults in src/config.js to avoid breaking tests
process.env.NODE_ENV = 'test'

// Auth
process.env.ADMIN_UI_ENTRA_CLIENT_ID = 'test'
process.env.DEFRA_ID_CLIENT_ID = 'test-defra'
process.env.ENTRA_OIDC_WELL_KNOWN_CONFIGURATION_URL =
  'https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007/v2.0/.well-known/openid-configuration'
process.env.DEFRA_ID_OIDC_WELL_KNOWN_URL =
  'https://dcidmtest.b2clogin.com/DCIDMTest.onmicrosoft.com/v2.0/.well-known/openid-configuration'

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
// Use ECS log format to avoid pino-pretty transport (adds exit listeners)
process.env.LOG_FORMAT = 'ecs'
process.env.AUDIT_ENABLED = 'true'

// HTTP Proxy - not needed in tests
// process.env.HTTP_PROXY is intentionally not set (null in config.js)

// Feature flags - explicitly set to false for predictable test behavior
process.env.FEATURE_FLAG_SUMMARY_LOGS = 'false'
process.env.FEATURE_FLAG_FORMS_DATA_MIGRATION = 'false'
process.env.FEATURE_FLAG_LOG_FILE_UPLOADS_FROM_FORMS = 'false'

// Form submission overrides - anonymized test data (not production IDs)
// Format matches cdp-app-config for easy comparison
process.env.FORM_SUBMISSION_OVERRIDES =
  '{"registrations":[{"id":"507f1f77bcf86cd799439011","overrides":{"systemReference":"507f191e810c19729de860ea"}},{"id":"507f1f77bcf86cd799439012","overrides":{"systemReference":"507f191e810c19729de860eb"}}],"accreditations":[{"id":"65a2f4e8b4c5d9f8e7a6b1c2","overrides":{"systemReference":"65a2f5a1b4c5d9f8e7a6b1c3"}},{"id":"65a2f4e8b4c5d9f8e7a6b1c4","overrides":{"systemReference":"65a2f5a1b4c5d9f8e7a6b1c5"}}],"organisations":[{"id":"60a1f2b3c4d5e6f7a8b9c0d1","overrides":{"orgId":999999}}]}'

process.env.SYSTEM_REFERENCES_REQUIRING_ORG_ID_MATCH =
  '["507f191e810c19729de860ea","507f191e810c19729de860eb","65a2f5a1b4c5d9f8e7a6b1c3","65a2f5a1b4c5d9f8e7a6b1c5"]'

process.env.TEST_ORGANISATIONS = '[999999]'

beforeAll(async () => {
  // Setup fetch mock
  fetchMock.enableMocks()
  global.fetch = fetchMock
  global.fetchMock = fetchMock
})

afterAll(async () => {
  fetchMock.disableMocks()
})
