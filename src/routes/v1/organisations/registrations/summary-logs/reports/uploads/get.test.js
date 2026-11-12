import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { summaryLogUploadsReportPath } from './get.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  buildReadApprovedOrganisation,
  nextReadOrganisationNumber as nextOrganisationNumber
} from '#organisation-read-model/repository/read-model-test-data.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { ObjectId } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'

describe(`${summaryLogUploadsReportPath} route`, () => {
  setupAuthContext()

  let server
  /** @type {import('#organisation-read-model/domain/model.js').Organisation[]} */
  const servedOrganisations = []
  let summaryLogsRepository

  beforeAll(async () => {
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)

    server = await createTestServer({
      repositories: {
        organisationReadRepository: () =>
          createInMemoryOrganisationReadRepository(servedOrganisations)(),
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
      const organisationNumber = nextOrganisationNumber()
      const org = buildReadApprovedOrganisation({ organisationNumber })
      servedOrganisations.push(org)

      const submittedAt = '2026-01-20T14:30:00.000Z'

      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: new ObjectId().toString(),
          registrationId: new ObjectId().toString(),
          organisationNumber: org.organisationNumber,
          registrationNumber: `REG${organisationNumber}`,
          submittedAt
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
            orgId: Number(organisationNumber),
            registrationNumber: `REG${organisationNumber}`,
            accreditationNumber: `ACC${organisationNumber}`,
            reprocessingSite: '7 Glass processing site, London, SW2A 0AA',
            packagingWasteCategory: 'Glass-remelt',
            lastSuccessfulUpload: submittedAt,
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
        .spyOn(summaryLogsRepository, 'findAllSummaryLogStatsByRegistration')
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
