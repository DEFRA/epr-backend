import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { summaryLogFactory } from './test-data.js'

const generateOrgReg = () => ({
  organisationId: new ObjectId().toString(),
  registrationId: new ObjectId().toString()
})

function getMatchingStats(stats, organisationId, registrationId) {
  return stats.filter(
    (s) =>
      s.organisationId === organisationId && s.registrationId === registrationId
  )
}

export const testFindAllSummaryLogStatsByRegistrationId = (it) => {
  describe('findAllSummaryLogStatsByRegistrationId', () => {
    /** @type {import('../port.js').SummaryLogsRepository} */
    let repo

    beforeEach(async ({ summaryLogsRepository }) => {
      repo = summaryLogsRepository
    })

    it('returns empty array when no summary log uploads exist', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const stats = await repo.findAllSummaryLogStatsByRegistrationId()

      const matchingStats = getMatchingStats(
        stats,
        organisationId,
        registrationId
      )
      expect(matchingStats).toEqual([])
    })

    it('returns aggregated statistics with latest timestamp and correct count for registration with two successful uploads', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const firstCreatedAt = '2024-01-10T10:00:00.000Z'
      const latestCreatedAt = '2024-01-20T15:30:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          createdAt: firstCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          createdAt: latestCreatedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistrationId()

      const expectedStats = getMatchingStats(
        stats,
        organisationId,
        registrationId
      )

      expect(expectedStats).toBeDefined()
      expect(expectedStats).toMatchObject([
        {
          organisationId,
          registrationId,
          lastSuccessful: new Date(latestCreatedAt),
          lastFailed: null,
          successfulCount: 2,
          failedCount: 0
        }
      ])
    })

    it('returns aggregated statistics with latest timestamp and correct count for registration with two failed uploads', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const firstFailedCreatedAt = '2024-02-01T09:00:00.000Z'
      const latestFailedCreatedAt = '2024-02-05T14:30:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          createdAt: firstFailedCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          createdAt: latestFailedCreatedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistrationId()

      const expectedStats = getMatchingStats(
        stats,
        organisationId,
        registrationId
      )

      expect(expectedStats).toBeDefined()
      expect(expectedStats).toMatchObject([
        {
          organisationId,
          registrationId,
          lastSuccessful: null,
          lastFailed: new Date(latestFailedCreatedAt),
          successfulCount: 0,
          failedCount: 2
        }
      ])
    })

    it('returns aggregated statistics with both successful and failed counts and their respective latest timestamps for a single registration', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const firstSuccessfulCreatedAt = '2024-01-10T10:00:00.000Z'
      const latestSuccessfulCreatedAt = '2024-01-20T15:30:00.000Z'

      const firstFailedCreatedAt = '2024-02-01T09:00:00.000Z'
      const latestFailedCreatedAt = '2024-02-10T16:45:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          createdAt: firstSuccessfulCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          createdAt: latestSuccessfulCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          createdAt: firstFailedCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          createdAt: latestFailedCreatedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistrationId()

      const expectedStats = getMatchingStats(
        stats,
        organisationId,
        registrationId
      )

      expect(expectedStats).toBeDefined()
      expect(expectedStats).toMatchObject([
        {
          organisationId,
          registrationId,
          lastSuccessful: new Date(latestSuccessfulCreatedAt),
          lastFailed: new Date(latestFailedCreatedAt),
          successfulCount: 2,
          failedCount: 2
        }
      ])
    })

    it('returns separate aggregated statistics for each organisation with their respective successful and failed upload counts', async () => {
      const org1 = generateOrgReg()
      const org2 = generateOrgReg()

      const org1FirstCreatedAt = '2024-01-10T10:00:00.000Z'
      const org1LatestCreatedAt = '2024-01-20T15:30:00.000Z'

      const org2FirstFailedCreatedAt = '2024-02-01T09:00:00.000Z'
      const org2LatestFailedCreatedAt = '2024-02-05T14:30:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: org1.organisationId,
          registrationId: org1.registrationId,
          createdAt: org1FirstCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: org1.organisationId,
          registrationId: org1.registrationId,
          createdAt: org1LatestCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId: org2.organisationId,
          registrationId: org2.registrationId,
          createdAt: org2FirstFailedCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId: org2.organisationId,
          registrationId: org2.registrationId,
          createdAt: org2LatestFailedCreatedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistrationId()

      const org1Stats = getMatchingStats(
        stats,
        org1.organisationId,
        org1.registrationId
      )

      expect(org1Stats).toBeDefined()
      expect(org1Stats).toMatchObject([
        {
          organisationId: org1.organisationId,
          registrationId: org1.registrationId,
          lastSuccessful: new Date(org1LatestCreatedAt), // Validates against inserted data
          lastFailed: null,
          successfulCount: 2,
          failedCount: 0
        }
      ])

      const org2Stats = getMatchingStats(
        stats,
        org2.organisationId,
        org2.registrationId
      )
      expect(org2Stats).toBeDefined()
      expect(org2Stats).toMatchObject([
        {
          organisationId: org2.organisationId,
          registrationId: org2.registrationId,
          lastSuccessful: null,
          lastFailed: new Date(org2LatestFailedCreatedAt), // Validates against inserted data
          successfulCount: 0,
          failedCount: 2
        }
      ])
    })

    it('return latest successful timestamp even when its out of order', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const latestCreatedAt = '2024-05-20T10:00:00.000Z'
      const olderCreatedAt = '2024-01-10T10:00:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          createdAt: latestCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          createdAt: olderCreatedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistrationId()
      const matchingStats = getMatchingStats(
        stats,
        organisationId,
        registrationId
      )

      expect(matchingStats[0]).toMatchObject({
        successfulCount: 2,
        lastSuccessful: new Date(latestCreatedAt) // Should still be the latestCreatedAt, not olderCreatedAt
      })
    })
  })
}
