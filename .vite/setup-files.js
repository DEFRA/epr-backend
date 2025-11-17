import { afterAll, beforeAll } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

const fetchMock = createFetchMock(vi)

// Remove environment variables before any modules are loaded
// This ensures test tokens and config defaults are used consistently
delete process.env.ADMIN_UI_ENTRA_CLIENT_ID
delete process.env.SERVICE_MAINTAINER_EMAILS

beforeAll(async () => {
  // Setup fetch mock
  fetchMock.enableMocks()
  global.fetch = fetchMock
  global.fetchMock = fetchMock

  // Setup AWS credentials for LocalStack
  process.env.AWS_ACCESS_KEY_ID = 'test'
  process.env.AWS_SECRET_ACCESS_KEY = 'test'
})

afterAll(async () => {
  fetchMock.disableMocks()
})
