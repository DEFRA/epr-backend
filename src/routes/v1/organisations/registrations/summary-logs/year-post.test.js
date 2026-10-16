import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockLogger } from '#test/mock-logger.js'
import { asOperator } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const mockLogger = createMockLogger()

const APPROVED_SINCE_2025 = [
  { status: 'created', updatedAt: '2025-01-01' },
  { status: 'approved', updatedAt: '2025-01-01' }
]

const buildUrl = (organisationId, registrationId, year) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${year}`

describe('POST .../registrations/{registrationId}/summary-logs/{year}', () => {
  setupAuthContext()

  let server
  let summaryLogsRepository
  let uploadsRepository
  let organisationsRepository

  const setupServer = async (organisation) => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)
    uploadsRepository = createInMemoryUploadsRepository()
    organisationsRepository = createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: () => summaryLogsRepository,
        organisationsRepository,
        uploadsRepository
      }
    })

    await server.initialize()
  }

  afterEach(async () => {
    vi.restoreAllMocks()
    await server?.stop()
  })

  describe('an active registration', () => {
    let organisationId
    let registrationId

    beforeAll(async () => {
      const registration = buildRegistration({
        statusHistory: APPROVED_SINCE_2025,
        validFrom: '2025-01-01'
      })
      const organisation = buildOrganisation({ registrations: [registration] })
      organisationId = organisation.id
      registrationId = registration.id

      await setupServer(organisation)
    })

    it('returns 201 for a year the registration is active in', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisationId, registrationId, 2025),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('carries the year on the upload-completed callback', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisationId, registrationId, 2025),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      const body = JSON.parse(response.payload)
      expect(uploadsRepository.initiateCalls.at(-1).callbackUrl).toContain(
        `/summary-logs/2025/${body.summaryLogId}/upload-completed`
      )
    })

    it('re-throws Boom errors from the uploads repository', async () => {
      vi.spyOn(uploadsRepository, 'initiateSummaryLogUpload').mockRejectedValue(
        Boom.badGateway('CDP Uploader is down')
      )

      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisationId, registrationId, 2025),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_GATEWAY)
    })

    it('wraps non-Boom errors from the uploads repository in a 500', async () => {
      vi.spyOn(uploadsRepository, 'initiateSummaryLogUpload').mockRejectedValue(
        new Error('Network failure')
      )

      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisationId, registrationId, 2025),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })

    it('returns 422 for a future year', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisationId, registrationId, 2099),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 for a year before the registration was approved', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisationId, registrationId, 2024),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('registration not found', () => {
    let organisationId

    beforeAll(async () => {
      const organisation = buildOrganisation({ registrations: [] })
      organisationId = organisation.id
      await setupServer(organisation)
    })

    it('returns 404', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisationId, 'missing-reg', 2025),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('params validation', () => {
    let organisationId
    let registrationId

    beforeAll(async () => {
      const registration = buildRegistration({
        statusHistory: APPROVED_SINCE_2025,
        validFrom: '2025-01-01'
      })
      const organisation = buildOrganisation({ registrations: [registration] })
      organisationId = organisation.id
      registrationId = registration.id
      await setupServer(organisation)
    })

    it('returns 422 for a non-numeric year', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisationId, registrationId, 'not-a-year'),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when redirectUrl is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisationId, registrationId, 2025),
        ...asOperator(),
        payload: {}
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })
})
