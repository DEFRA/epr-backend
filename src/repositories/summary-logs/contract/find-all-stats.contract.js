import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { randomInt } from 'node:crypto'

import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { summaryLogFactory } from './test-data.js'

/**
 * @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { SummaryLogStats } from '../port.js'
 */

const generateOrgReg = () => {
  const unique = randomInt(100_000_000, 1_000_000_000)
  return {
    organisationId: new ObjectId().toString(),
    registrationId: new ObjectId().toString(),
    organisationNumber: toOrganisationNumber(String(unique)),
    registrationNumber: toRegistrationNumber(`R26ER${unique}PA`)
  }
}

/**
 * @param {SummaryLogStats[]} stats
 * @param {OrganisationNumber} organisationNumber
 * @param {RegistrationNumber} registrationNumber
 */
function getMatchingStats(stats, organisationNumber, registrationNumber) {
  return stats.filter(
    (s) =>
      s.organisationNumber === organisationNumber &&
      s.registrationNumber === registrationNumber
  )
}

export const testFindAllSummaryLogStatsByRegistration = (it) => {
  describe('findAllSummaryLogStatsByRegistration', () => {
    /** @type {import('../port.js').SummaryLogsRepository} */
    let repo

    beforeEach(
      async (
        /** @type {{ summaryLogsRepository: import('../port.js').SummaryLogsRepository }} */ {
          summaryLogsRepository
        }
      ) => {
        repo = summaryLogsRepository
      }
    )

    it('returns empty array when no summary log uploads exist', async () => {
      const { organisationNumber, registrationNumber } = generateOrgReg()

      const stats = await repo.findAllSummaryLogStatsByRegistration()

      const matchingStats = getMatchingStats(
        stats,
        organisationNumber,
        registrationNumber
      )
      expect(matchingStats).toEqual([])
    })

    it('returns aggregated statistics with latest timestamp and correct count for registration with two successful uploads', async () => {
      const {
        organisationId,
        registrationId,
        organisationNumber,
        registrationNumber
      } = generateOrgReg()

      const firstSubmittedAt = '2024-01-10T10:00:00.000Z'
      const latestSubmittedCreatedAt = '2024-01-20T15:30:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          submittedAt: firstSubmittedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          submittedAt: latestSubmittedCreatedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistration()

      const expectedStats = getMatchingStats(
        stats,
        organisationNumber,
        registrationNumber
      )

      expect(expectedStats).toBeDefined()
      expect(expectedStats).toMatchObject([
        {
          organisationNumber,
          registrationNumber,
          lastSuccessful: new Date(latestSubmittedCreatedAt),
          lastFailed: null,
          successfulCount: 2,
          failedCount: 0
        }
      ])
    })

    it('returns aggregated statistics with latest timestamp and correct count for registration with two failed uploads', async () => {
      const {
        organisationId,
        registrationId,
        organisationNumber,
        registrationNumber
      } = generateOrgReg()

      const firstFailedCreatedAt = '2024-02-01T09:00:00.000Z'
      const latestFailedCreatedAt = '2024-02-05T14:30:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          createdAt: firstFailedCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          createdAt: latestFailedCreatedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistration()

      const expectedStats = getMatchingStats(
        stats,
        organisationNumber,
        registrationNumber
      )

      expect(expectedStats).toBeDefined()
      expect(expectedStats).toMatchObject([
        {
          organisationNumber,
          registrationNumber,
          lastSuccessful: null,
          lastFailed: new Date(latestFailedCreatedAt),
          successfulCount: 0,
          failedCount: 2
        }
      ])
    })

    it('returns aggregated statistics with both successful and failed counts and their respective latest timestamps for a single registration', async () => {
      const {
        organisationId,
        registrationId,
        organisationNumber,
        registrationNumber
      } = generateOrgReg()

      const firstSubmittedAt = '2024-01-10T10:00:00.000Z'
      const latestSubmittedAt = '2024-01-20T15:30:00.000Z'

      const firstFailedCreatedAt = '2024-02-01T09:00:00.000Z'
      const latestFailedCreatedAt = '2024-02-10T16:45:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          submittedAt: firstSubmittedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          submittedAt: latestSubmittedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          createdAt: firstFailedCreatedAt,
          submittedAt: firstFailedCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          createdAt: latestFailedCreatedAt,
          submittedAt: latestFailedCreatedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistration()

      const expectedStats = getMatchingStats(
        stats,
        organisationNumber,
        registrationNumber
      )

      expect(expectedStats).toBeDefined()
      expect(expectedStats).toMatchObject([
        {
          organisationNumber,
          registrationNumber,
          lastSuccessful: new Date(latestSubmittedAt),
          lastFailed: new Date(latestFailedCreatedAt),
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

      const org2FirstFailedCreatedAt = '2024-02-01T09:00:00.000Z'
      const org2LatestFailedCreatedAt = '2024-02-05T14:30:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: org1.organisationId,
          registrationId: org1.registrationId,
          organisationNumber: org1.organisationNumber,
          registrationNumber: org1.registrationNumber,
          submittedAt: org1FirstSubmittedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: org1.organisationId,
          registrationId: org1.registrationId,
          organisationNumber: org1.organisationNumber,
          registrationNumber: org1.registrationNumber,
          submittedAt: org1LatestSubmittedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId: org2.organisationId,
          registrationId: org2.registrationId,
          organisationNumber: org2.organisationNumber,
          registrationNumber: org2.registrationNumber,
          createdAt: org2FirstFailedCreatedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submissionFailed({
          organisationId: org2.organisationId,
          registrationId: org2.registrationId,
          organisationNumber: org2.organisationNumber,
          registrationNumber: org2.registrationNumber,
          createdAt: org2LatestFailedCreatedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistration()

      const org1Stats = getMatchingStats(
        stats,
        org1.organisationNumber,
        org1.registrationNumber
      )

      expect(org1Stats).toBeDefined()
      expect(org1Stats).toMatchObject([
        {
          organisationNumber: org1.organisationNumber,
          registrationNumber: org1.registrationNumber,
          lastSuccessful: new Date(org1LatestSubmittedAt), // Validates against inserted data
          lastFailed: null,
          successfulCount: 2,
          failedCount: 0
        }
      ])

      const org2Stats = getMatchingStats(
        stats,
        org2.organisationNumber,
        org2.registrationNumber
      )
      expect(org2Stats).toBeDefined()
      expect(org2Stats).toMatchObject([
        {
          organisationNumber: org2.organisationNumber,
          registrationNumber: org2.registrationNumber,
          lastSuccessful: null,
          lastFailed: new Date(org2LatestFailedCreatedAt), // Validates against inserted data
          successfulCount: 0,
          failedCount: 2
        }
      ])
    })

    it('return latest successful timestamp even when its out of order', async () => {
      const {
        organisationId,
        registrationId,
        organisationNumber,
        registrationNumber
      } = generateOrgReg()

      const latestSubmittedAt = '2024-05-20T10:00:00.000Z'
      const olderSubmittedAt = '2024-01-10T10:00:00.000Z'

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          submittedAt: latestSubmittedAt
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          organisationNumber,
          registrationNumber,
          submittedAt: olderSubmittedAt
        })
      )

      const stats = await repo.findAllSummaryLogStatsByRegistration()
      const matchingStats = getMatchingStats(
        stats,
        organisationNumber,
        registrationNumber
      )

      expect(matchingStats[0]).toMatchObject({
        successfulCount: 2,
        lastSuccessful: new Date(latestSubmittedAt) // Should still be the latestCreatedAt, not olderCreatedAt
      })
    })
  })
}
