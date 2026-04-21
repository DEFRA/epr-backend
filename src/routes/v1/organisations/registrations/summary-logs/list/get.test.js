import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { ObjectId } from 'mongodb'

import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { logger } from '#common/helpers/logging/logger.js'
import { summaryLogsListPath } from './get.js'

const pathFor = (organisationId, registrationId) =>
  summaryLogsListPath
    .replace('{organisationId}', organisationId)
    .replace('{registrationId}', registrationId)

describe(`${summaryLogsListPath} route`, () => {
  setupAuthContext()

  let server
  let summaryLogsRepository

  beforeAll(async () => {
    const organisationsRepository = createInMemoryOrganisationsRepository()()
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
    it('returns 200 with an empty array when no logs exist for the registration', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const response = await server.inject({
        method: 'GET',
        url: pathFor(organisationId, registrationId),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ summaryLogs: [] })
    })

    it('returns successful and failed logs for the registration, newest first', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const submittedId = new ObjectId().toString()
      const failedId = new ObjectId().toString()

      await summaryLogsRepository.insert(
        submittedId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-02-01T10:00:00.000Z',
          createdAt: '2026-02-01T09:55:00.000Z',
          file: { name: 'january.xlsx' }
        })
      )

      await summaryLogsRepository.insert(
        failedId,
        summaryLogFactory.validationFailed({
          organisationId,
          registrationId,
          createdAt: '2026-02-02T11:00:00.000Z',
          file: { name: 'february.xlsx' }
        })
      )

      const response = await server.inject({
        method: 'GET',
        url: pathFor(organisationId, registrationId),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const payload = JSON.parse(response.payload)
      expect(payload).toEqual({
        summaryLogs: [
          {
            summaryLogId: failedId,
            filename: 'february.xlsx',
            uploadedAt: '2026-02-02T11:00:00.000Z',
            status: SUMMARY_LOG_STATUS.VALIDATION_FAILED
          },
          {
            summaryLogId: submittedId,
            filename: 'january.xlsx',
            uploadedAt: '2026-02-01T10:00:00.000Z',
            status: SUMMARY_LOG_STATUS.SUBMITTED
          }
        ]
      })
    })

    it('excludes intermediate statuses from the list', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.preprocessing({ organisationId, registrationId })
      )
      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.validating({ organisationId, registrationId })
      )
      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.validated({ organisationId, registrationId })
      )
      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitting({ organisationId, registrationId })
      )

      const visibleId = new ObjectId().toString()
      await summaryLogsRepository.insert(
        visibleId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-03-01T10:00:00.000Z'
        })
      )

      const response = await server.inject({
        method: 'GET',
        url: pathFor(organisationId, registrationId),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.summaryLogs).toHaveLength(1)
      expect(payload.summaryLogs[0].summaryLogId).toBe(visibleId)
      expect(payload.summaryLogs[0].status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
    })

    it('does not leak logs from other organisations or registrations', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()
      const otherOrgId = new ObjectId().toString()
      const otherRegId = new ObjectId().toString()

      const ownId = new ObjectId().toString()
      await summaryLogsRepository.insert(
        ownId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-04-01T10:00:00.000Z'
        })
      )

      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: otherOrgId,
          registrationId,
          submittedAt: '2026-04-02T10:00:00.000Z'
        })
      )

      await summaryLogsRepository.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId: otherRegId,
          submittedAt: '2026-04-03T10:00:00.000Z'
        })
      )

      const response = await server.inject({
        method: 'GET',
        url: pathFor(organisationId, registrationId),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.summaryLogs).toHaveLength(1)
      expect(payload.summaryLogs[0].summaryLogId).toBe(ownId)
    })

    it('uses createdAt for uploadedAt when submittedAt is absent (e.g. invalid/validation_failed)', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const failedId = new ObjectId().toString()
      await summaryLogsRepository.insert(
        failedId,
        summaryLogFactory.invalid({
          organisationId,
          registrationId,
          createdAt: '2026-05-10T08:00:00.000Z'
        })
      )

      const response = await server.inject({
        method: 'GET',
        url: pathFor(organisationId, registrationId),
        ...asServiceMaintainer()
      })

      const payload = JSON.parse(response.payload)
      const row = payload.summaryLogs.find((r) => r.summaryLogId === failedId)
      expect(row.uploadedAt).toBe('2026-05-10T08:00:00.000Z')
      expect(row.status).toBe(SUMMARY_LOG_STATUS.INVALID)
    })
  })

  describe('error scenarios', () => {
    it('returns 500 when repository throws', async () => {
      const errorSpy = vi
        .spyOn(summaryLogsRepository, 'findAllByOrgReg')
        .mockRejectedValue(new Error('Simulated Database Failure'))

      const response = await server.inject({
        method: 'GET',
        url: pathFor(new ObjectId().toString(), new ObjectId().toString()),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

      errorSpy.mockRestore()
    })
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: pathFor(new ObjectId().toString(), new ObjectId().toString())
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when user is not a service maintainer', async () => {
      const response = await server.inject({
        method: 'GET',
        url: pathFor(new ObjectId().toString(), new ObjectId().toString()),
        ...asServiceMaintainer({ scope: ['standardUser'] })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
