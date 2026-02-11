import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach
} from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { summaryLogsCreatePath } from './post.js'

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}

const organisationId = 'org-123'
const registrationId = 'reg-456'

describe(`${summaryLogsCreatePath} route`, () => {
  setupAuthContext()

  describe('successful requests', () => {
    let server
    let summaryLogsRepository
    let uploadsRepository

    beforeAll(async () => {
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)
      uploadsRepository = createInMemoryUploadsRepository()

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: () => summaryLogsRepository,
          uploadsRepository
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      await server.initialize()
    })

    afterEach(() => {
      uploadsRepository.initiateCalls.length = 0
    })

    afterAll(async () => {
      await server.stop()
    })

    it('returns 201 with summary log and upload details', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const body = JSON.parse(response.payload)
      expect(body.summaryLogId).toBeDefined()
      expect(body.uploadId).toBeDefined()
      expect(body.uploadUrl).toContain(body.uploadId)
      expect(body.statusUrl).toContain(body.uploadId)
    })

    it('does not create summary log record', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      const body = JSON.parse(response.payload)
      const stored = await summaryLogsRepository.findById(body.summaryLogId)

      expect(stored).toBeNull()
    })

    it('initiates upload via uploads repository', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      const body = JSON.parse(response.payload)

      expect(uploadsRepository.initiateCalls).toHaveLength(1)
      expect(uploadsRepository.initiateCalls[0]).toEqual({
        organisationId,
        registrationId,
        summaryLogId: body.summaryLogId,
        redirectUrl: 'https://frontend.test/redirect',
        callbackUrl: `http://localhost:3001/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${body.summaryLogId}/upload-completed`
      })
    })

    it('generates unique summaryLogId for each request', async () => {
      const responses = await Promise.all([
        server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { redirectUrl: 'https://frontend.test/redirect' }
        }),
        server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { redirectUrl: 'https://frontend.test/redirect' }
        })
      ])

      const ids = responses.map((r) => JSON.parse(r.payload).summaryLogId)
      expect(ids[0]).not.toBe(ids[1])
    })
  })

  describe('error handling', () => {
    let server
    let uploadsRepository

    beforeAll(async () => {
      uploadsRepository = createInMemoryUploadsRepository()

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: () =>
            createInMemorySummaryLogsRepository()(mockLogger),
          uploadsRepository
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      await server.initialize()
    })

    afterAll(async () => {
      await server.stop()
    })

    afterEach(() => {
      uploadsRepository.initiateSummaryLogUpload = uploadsRepository.initiate
    })

    it('re-throws Boom errors from uploads repository', async () => {
      const boomError = Boom.badGateway('CDP Uploader is down')
      uploadsRepository.initiateSummaryLogUpload = vi
        .fn()
        .mockRejectedValue(boomError)

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_GATEWAY)
    })

    it('wraps non-Boom errors in badImplementation', async () => {
      const genericError = new Error('Network failure')
      uploadsRepository.initiateSummaryLogUpload = vi
        .fn()
        .mockRejectedValue(genericError)

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })

  describe('payload validation', () => {
    let server

    beforeAll(async () => {
      server = await createTestServer({
        repositories: {
          summaryLogsRepository: () =>
            createInMemorySummaryLogsRepository()(mockLogger),
          uploadsRepository: createInMemoryUploadsRepository()
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      await server.initialize()
    })

    afterAll(async () => {
      await server.stop()
    })

    it('returns 422 when redirectUrl is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: {}
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('accepts relative paths for redirectUrl', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: {
          redirectUrl:
            '/organisations/org-123/registrations/reg-456/summary-logs/sl-789'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })
  })
})
