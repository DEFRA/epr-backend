import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ObjectId } from 'mongodb'

import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import {
  REPROCESSOR_NUMBER,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { logger } from '#common/helpers/logging/logger.js'

const { buildOrganisation } = createOrganisationBuilders()

const OTHER_REGISTRATION_NUMBER = 'R26ER5001180099PL'

const registration = reprocessor()
const otherRegistration = reprocessor({
  registrationNumber: OTHER_REGISTRATION_NUMBER
})
const organisation = buildOrganisation({
  registrations: [registration, otherRegistration]
})

const organisationNumber = toOrganisationNumber(String(organisation.orgId))
const registrationNumber = registration.registrationNumber
const registrations = `/organisations/${organisation.orgId}/registrations`
const url = `${registrations}/${REPROCESSOR_NUMBER}/summary-logs`

describe('GET /organisations/{organisationNumber}/registrations/{registrationNumber}/summary-logs', () => {
  setupAuthContext()

  let server
  let summaryLogsRepository

  beforeEach(async () => {
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)

    server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(organisation)
        ]),
        summaryLogsRepository: () => summaryLogsRepository
      }
    })

    await server.initialize()
  })

  afterEach(async () => {
    await server.stop()
  })

  const list = (path = url) =>
    server.inject({ method: 'GET', url: path, ...asServiceMaintainer() })

  describe('successful requests', () => {
    it('returns 200 with an empty array when no logs exist for the registration', async () => {
      const response = await list()

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ summaryLogs: [] })
    })

    it('returns successful and failed logs for the registration, newest first', async () => {
      const submittedId = new ObjectId().toString()
      const failedId = new ObjectId().toString()

      await summaryLogsRepository.insert(
        submittedId,
        summaryLogFactory.submitted({
          organisationNumber,
          registrationNumber,
          year: 2026,
          submittedAt: '2026-02-01T10:00:00.000Z',
          createdAt: '2026-02-01T09:55:00.000Z',
          file: { name: 'january.xlsx' }
        })
      )

      await summaryLogsRepository.insert(
        failedId,
        summaryLogFactory.validationFailed({
          organisationNumber,
          registrationNumber,
          year: 2026,
          createdAt: '2026-02-02T11:00:00.000Z',
          file: { name: 'february.xlsx' }
        })
      )

      const response = await list()

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        summaryLogs: [
          {
            summaryLogId: failedId,
            filename: 'february.xlsx',
            uploadedAt: '2026-02-02T11:00:00.000Z',
            status: SUMMARY_LOG_STATUS.VALIDATION_FAILED,
            year: 2026
          },
          {
            summaryLogId: submittedId,
            filename: 'january.xlsx',
            uploadedAt: '2026-02-01T10:00:00.000Z',
            status: SUMMARY_LOG_STATUS.SUBMITTED,
            year: 2026
          }
        ]
      })
    })

    it('does not include the accreditation id', async () => {
      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationNumber,
          registrationNumber,
          accreditationId: 'acc-1'
        })
      )

      const response = await list()

      const [row] = JSON.parse(response.payload).summaryLogs
      expect(row).not.toHaveProperty('accreditationId')
    })

    it('excludes intermediate statuses from the list', async () => {
      for (const build of [
        summaryLogFactory.preprocessing,
        summaryLogFactory.validating,
        summaryLogFactory.validated,
        summaryLogFactory.submitting
      ]) {
        await summaryLogsRepository.insert(
          new ObjectId().toString(),
          build({ organisationNumber, registrationNumber })
        )
      }

      const visibleId = new ObjectId().toString()
      await summaryLogsRepository.insert(
        visibleId,
        summaryLogFactory.submitted({
          organisationNumber,
          registrationNumber,
          submittedAt: '2026-03-01T10:00:00.000Z'
        })
      )

      const response = await list()

      expect(response.statusCode).toBe(StatusCodes.OK)
      const { summaryLogs } = JSON.parse(response.payload)
      expect(summaryLogs).toHaveLength(1)
      expect(summaryLogs[0].summaryLogId).toBe(visibleId)
      expect(summaryLogs[0].status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
    })

    it('does not leak logs from other organisations or registrations', async () => {
      const ownId = new ObjectId().toString()
      await summaryLogsRepository.insert(
        ownId,
        summaryLogFactory.submitted({
          organisationNumber,
          registrationNumber,
          submittedAt: '2026-04-01T10:00:00.000Z'
        })
      )

      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationNumber: toOrganisationNumber('999999'),
          registrationNumber,
          submittedAt: '2026-04-02T10:00:00.000Z'
        })
      )

      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationNumber,
          registrationNumber: otherRegistration.registrationNumber,
          submittedAt: '2026-04-03T10:00:00.000Z'
        })
      )

      const response = await list()

      expect(response.statusCode).toBe(StatusCodes.OK)
      const { summaryLogs } = JSON.parse(response.payload)
      expect(summaryLogs).toHaveLength(1)
      expect(summaryLogs[0].summaryLogId).toBe(ownId)
    })

    it('uses createdAt for uploadedAt when submittedAt is absent (e.g. invalid/validation_failed)', async () => {
      const failedId = new ObjectId().toString()
      await summaryLogsRepository.insert(
        failedId,
        summaryLogFactory.invalid({
          organisationNumber,
          registrationNumber,
          createdAt: '2026-05-10T08:00:00.000Z'
        })
      )

      const response = await list()

      const row = JSON.parse(response.payload).summaryLogs.find(
        (r) => r.summaryLogId === failedId
      )
      expect(row.uploadedAt).toBe('2026-05-10T08:00:00.000Z')
      expect(row.status).toBe(SUMMARY_LOG_STATUS.INVALID)
    })
  })

  describe('error scenarios', () => {
    it('returns 404 for a registration the organisation does not hold', async () => {
      const response = await list(
        `${registrations}/R26ER9999999999PL/summary-logs`
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 for an unknown organisation', async () => {
      const response = await list(
        `/organisations/999999/registrations/${REPROCESSOR_NUMBER}/summary-logs`
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 500 when repository throws', async () => {
      vi.spyOn(summaryLogsRepository, 'findAll').mockRejectedValue(
        new Error('Simulated Database Failure')
      )

      const response = await list()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({ method: 'GET', url })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when user is not a service maintainer', async () => {
      const response = await server.inject({
        method: 'GET',
        url,
        ...asServiceMaintainer({ scope: ['standardUser'] })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
