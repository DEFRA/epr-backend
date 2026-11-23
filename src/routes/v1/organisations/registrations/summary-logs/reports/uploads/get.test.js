import { StatusCodes } from 'http-status-codes'
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi
} from 'vitest'

import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { summaryLogUploadsReportPath } from './get.js'
import { DEFAULT_TEMPLATE_YEAR } from '#domain/summary-logs/template-year.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import {
  createInMemoryOrganisationReadRepository,
  buildReadApprovedOrganisation,
  nextReadOrganisationNumber as nextOrganisationNumber
} from '#organisation-read-model/test-support.js'
import {
  summaryLogFactory,
  WITHIN_DEFAULT_TEMPLATE_YEAR
} from '#repositories/summary-logs/contract/test-data.js'
import { ObjectId } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'

const urlForYear = (year) => `${summaryLogUploadsReportPath}?year=${year}`

describe(`${summaryLogUploadsReportPath} route`, () => {
  setupAuthContext()

  let server
  /** @type {import('#organisation-read-model/vocabulary.js').Organisation[]} */
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
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['Date'],
        now: WITHIN_DEFAULT_TEMPLATE_YEAR
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

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
        url: urlForYear(DEFAULT_TEMPLATE_YEAR),
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

  describe('year', () => {
    it.for([
      ['no year', summaryLogUploadsReportPath],
      ['a year that is not a number', urlForYear('last')],
      ['a year before the service holds data', urlForYear(2023)],
      ['a year not yet open', urlForYear(2099)]
    ])('refuses %s', async ([, url]) => {
      const statsSpy = vi.spyOn(
        summaryLogsRepository,
        'findAllSummaryLogStatsByRegistration'
      )

      const response = await server.inject({
        method: 'GET',
        url,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(statsSpy).not.toHaveBeenCalled()

      statsSpy.mockRestore()
    })
  })

  describe('error scenarios', () => {
    it('returns 500 when summary log report generation fails', async () => {
      const errorSpy = vi
        .spyOn(summaryLogsRepository, 'findAllSummaryLogStatsByRegistration')
        .mockRejectedValue(new Error('Simulated Database Failure'))

      const response = await server.inject({
        method: 'GET',
        url: urlForYear(DEFAULT_TEMPLATE_YEAR),
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
        url: urlForYear(DEFAULT_TEMPLATE_YEAR),
        ...asServiceMaintainer({ scope: ['standardUser'] })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
