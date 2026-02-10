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

      const firstSubmittedAt = '2024-01-10T10:00:00.000Z'
      const latestSubmittedAt = '2024-01-20T15:30:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: firstSubmittedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: latestSubmittedAt
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
          lastSuccessful: new Date(latestSubmittedAt),
          lastFailed: null,
          successfulCount: 2,
          failedCount: 0
        }
      ])
    })

    it('returns aggregated statistics with latest timestamp and correct count for registration with two failed uploads', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const firstFailedAt = '2024-02-01T09:00:00.000Z'
      const latestFailedAt = '2024-02-05T14:30:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          submittedAt: firstFailedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          submittedAt: latestFailedAt
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
          lastFailed: new Date(latestFailedAt),
          successfulCount: 0,
          failedCount: 2
        }
      ])
    })

    it('returns aggregated statistics with both successful and failed counts and their respective latest timestamps for a single registration', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const firstSuccessfulAt = '2024-01-10T10:00:00.000Z'
      const latestSuccessfulAt = '2024-01-20T15:30:00.000Z'

      const firstFailedAt = '2024-02-01T09:00:00.000Z'
      const latestFailedAt = '2024-02-10T16:45:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: firstSuccessfulAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: latestSuccessfulAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          submittedAt: firstFailedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          submittedAt: latestFailedAt
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
          lastSuccessful: new Date(latestSuccessfulAt),
          lastFailed: new Date(latestFailedAt),
          successfulCount: 2,
          failedCount: 2
        }
      ])
    })

    it('returns separate aggregated statistics for each organisation with their respective successful and failed upload counts', async () => {
      const org1 = generateOrgReg()
      const org2 = generateOrgReg()

      const org1FirstSubmittedAt = '2024-01-10T10:00:00.000Z'
      const org1LatestSubmittedAt = '2024-01-20T15:30:00.000Z'

      const org2FirstFailedAt = '2024-02-01T09:00:00.000Z'
      const org2LatestFailedAt = '2024-02-05T14:30:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: org1.organisationId,
          registrationId: org1.registrationId,
          submittedAt: org1FirstSubmittedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: org1.organisationId,
          registrationId: org1.registrationId,
          submittedAt: org1LatestSubmittedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId: org2.organisationId,
          registrationId: org2.registrationId,
          submittedAt: org2FirstFailedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId: org2.organisationId,
          registrationId: org2.registrationId,
          submittedAt: org2LatestFailedAt
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
          lastSuccessful: new Date(org1LatestSubmittedAt), // Validates against inserted data
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
          lastFailed: new Date(org2LatestFailedAt), // Validates against inserted data
          successfulCount: 0,
          failedCount: 2
        }
      ])
    })

    it('return latest successful timestamp even when its out of order', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const latestDate = '2024-05-20T10:00:00.000Z'
      const olderDate = '2024-01-10T10:00:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: latestDate
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: olderDate
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
        lastSuccessful: new Date(latestDate) // Should still be the latestDate, not olderDate
      })
    })
  })
}
