import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { summaryLogUploadsReportPath } from './get.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { generateOrgId } from '#repositories/organisations/contract/test-data.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { ObjectId } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'

describe(`${summaryLogUploadsReportPath} route`, () => {
  setupAuthContext()

  let server
  let organisationsRepository
  let summaryLogsRepository

  beforeAll(async () => {
    organisationsRepository = createInMemoryOrganisationsRepository()()
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)

    server = await createTestServer({
      repositories: {
        organisationsRepository: () => organisationsRepository,
        summaryLogsRepository: () => summaryLogsRepository
      }
    })

    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('successful requests', () => {
    it('returns 200 with summary log uploads report data', async () => {
      const orgId = generateOrgId()
      const org = await buildApprovedOrg(organisationsRepository, { orgId })
      const registration = org.registrations[0]

      const createdAt = '2026-01-20T14:30:00.000Z'

      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: org.id,
          registrationId: registration.id,
          createdAt
        })
      )

      const response = await server.inject({
        method: 'GET',
        url: summaryLogUploadsReportPath,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const payload = JSON.parse(response.payload)
      expect(payload).toEqual({
        summaryLogUploads: [
          {
            appropriateAgency: 'EA',
            type: 'Reprocessor',
            businessName: 'ACME ltd',
            orgId,
            registrationNumber: 'REG1',
            accreditationNumber: 'ACC1',
            reprocessingSite: '7 Glass processing site, London, SW2A 0AA',
            packagingWasteCategory: 'Glass-remelt',
            lastSuccessfulUpload: createdAt,
            lastFailedUpload: '',
            successfulUploads: 1,
            failedUploads: 0
          }
        ],
        generatedAt: expect.any(String)
      })
    })
  })

  describe('error scenarios', () => {
    it('returns 500 when summary log report generation fails', async () => {
      const errorSpy = vi
        .spyOn(summaryLogsRepository, 'findAllSummaryLogStatsByRegistrationId')
        .mockRejectedValue(new Error('Simulated Database Failure'))

      const response = await server.inject({
        method: 'GET',
        url: summaryLogUploadsReportPath,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

      const payload = JSON.parse(response.payload)
      expect(payload.message).toBe('An internal server error occurred')

      errorSpy.mockRestore()
    })
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: summaryLogUploadsReportPath
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when user is not a service maintainer', async () => {
      const response = await server.inject({
        method: 'GET',
        url: summaryLogUploadsReportPath,
        ...asServiceMaintainer({ scope: ['standardUser'] })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
