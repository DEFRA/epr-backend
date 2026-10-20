import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  storeNumberedRegistration,
  uniqueNumber
} from '#repositories/organisations/contract/natural-key-test-data.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { summaryLogFactory, withoutYear } from './test-data.js'

/**
 * @import { TestAPI } from 'vitest'
 * @import { SummaryLog } from '#domain/summary-logs/model.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { KeyedSummaryLogWithId, SummaryLogsRepository } from '../port.js'
 *
 * @typedef {{
 *   summaryLogsRepository: SummaryLogsRepository,
 *   organisationsRepository: OrganisationsRepository
 * }} NaturalKeyFixtures
 */

const STORED_IDS = ['organisationId', 'registrationId', 'accreditationId']

/** @param {KeyedSummaryLogWithId | null} found */
const storedIdsIn = (found) =>
  STORED_IDS.filter((key) => found && key in found.summaryLog)

/** @param {TestAPI<NaturalKeyFixtures>} it */
export const testFindByNaturalKey = (it) => {
  describe('finding by natural key', () => {
    /** @type {SummaryLogsRepository} */
    let repo
    /** @type {Awaited<ReturnType<typeof storeNumberedRegistration>>} */
    let stored

    beforeEach(
      async (
        /** @type {NaturalKeyFixtures} */ {
          summaryLogsRepository,
          organisationsRepository
        }
      ) => {
        repo = summaryLogsRepository
        stored = await storeNumberedRegistration(organisationsRepository)
      }
    )

    /** @param {Omit<SummaryLog, 'organisationId' | 'registrationId'>} summaryLog */
    const insert = async (summaryLog) => {
      const id = new ObjectId().toString()
      await repo.insert(id, { ...stored.ids, ...summaryLog })
      return id
    }

    describe('findLatestSubmitted', () => {
      it('returns null when no organisation has the number', async () => {
        await insert(summaryLogFactory.submitted())

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          organisationNumber: stored.unknownOrganisationNumber
        })

        expect(result).toBeNull()
      })

      it('returns null when the organisation holds no registration with the number', async () => {
        await insert(summaryLogFactory.submitted())

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          registrationNumber: uniqueNumber('REG')
        })

        expect(result).toBeNull()
      })

      it('returns null when the registration has no submitted summary log', async () => {
        await insert(summaryLogFactory.validated())

        const result = await repo.findLatestSubmitted(stored.key)

        expect(result).toBeNull()
      })

      it('returns the latest submitted summary log, named by its numbers in place of its ids', async () => {
        await insert(
          summaryLogFactory.submitted({
            accreditationId: stored.current.id,
            submittedAt: '2026-01-15T10:00:00.000Z'
          })
        )
        const latestId = await insert(
          summaryLogFactory.submitted({
            accreditationId: stored.current.id,
            submittedAt: '2026-02-15T10:00:00.000Z'
          })
        )

        const result = await repo.findLatestSubmitted(stored.key)

        expect(result).toMatchObject({
          id: latestId,
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.SUBMITTED,
            submittedAt: '2026-02-15T10:00:00.000Z',
            organisationNumber: stored.key.organisationNumber,
            registrationNumber: stored.key.registrationNumber,
            accreditationNumber: stored.current.accreditationNumber
          }
        })
        expect(storedIdsIn(result)).toEqual([])
      })

      it('finds only the accreditation the key names', async () => {
        const previousId = await insert(
          summaryLogFactory.submitted({
            accreditationId: stored.previous.id,
            submittedAt: '2026-01-15T10:00:00.000Z'
          })
        )
        await insert(
          summaryLogFactory.submitted({
            accreditationId: stored.current.id,
            submittedAt: '2026-02-15T10:00:00.000Z'
          })
        )

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          accreditationNumber: stored.previous.accreditationNumber
        })

        expect(result).toMatchObject({
          id: previousId,
          summaryLog: {
            accreditationNumber: stored.previous.accreditationNumber
          }
        })
      })

      it('finds only registered-only summary logs when the accreditation number is null', async () => {
        const registeredOnlyId = await insert(
          summaryLogFactory.submitted({
            accreditationId: null,
            submittedAt: '2026-01-15T10:00:00.000Z'
          })
        )
        await insert(
          summaryLogFactory.submitted({
            accreditationId: stored.current.id,
            submittedAt: '2026-02-15T10:00:00.000Z'
          })
        )

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          accreditationNumber: null
        })

        expect(result).toMatchObject({
          id: registeredOnlyId,
          summaryLog: { accreditationNumber: null }
        })
      })

      it('returns null when the organisation holds no accreditation with the number', async () => {
        await insert(
          summaryLogFactory.submitted({ accreditationId: stored.current.id })
        )

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          accreditationNumber: uniqueNumber('ACC')
        })

        expect(result).toBeNull()
      })

      it('counts a summary log stored before accreditations were recorded towards every accreditation', async () => {
        const unscopedId = await insert(
          withoutYear(summaryLogFactory.submitted())
        )

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          accreditationNumber: stored.current.accreditationNumber
        })

        expect(result?.id).toBe(unscopedId)
        expect(result?.summaryLog).not.toHaveProperty('accreditationNumber')
      })

      it('counts a summary log stored before accreditations were recorded as registered-only', async () => {
        const unscopedId = await insert(
          withoutYear(summaryLogFactory.submitted())
        )

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          accreditationNumber: null
        })

        expect(result?.id).toBe(unscopedId)
      })
    })

    describe('findAll', () => {
      it('returns an empty array when no organisation has the number', async () => {
        await insert(summaryLogFactory.submitted())

        const result = await repo.findAll({
          ...stored.key,
          organisationNumber: stored.unknownOrganisationNumber
        })

        expect(result).toEqual([])
      })

      it("returns the registration's submitted and failed summary logs, newest first, named by their numbers", async () => {
        const failedId = await insert(
          summaryLogFactory.validationFailed({
            accreditationId: stored.current.id,
            createdAt: '2026-03-01T10:00:00.000Z'
          })
        )
        const submittedId = await insert(
          summaryLogFactory.submitted({
            accreditationId: stored.previous.id,
            submittedAt: '2026-02-01T10:00:00.000Z'
          })
        )
        await insert(summaryLogFactory.validated())

        const result = await repo.findAll(stored.key)

        expect(result).toMatchObject([
          {
            id: failedId,
            summaryLog: {
              organisationNumber: stored.key.organisationNumber,
              registrationNumber: stored.key.registrationNumber,
              accreditationNumber: stored.current.accreditationNumber
            }
          },
          {
            id: submittedId,
            summaryLog: {
              accreditationNumber: stored.previous.accreditationNumber
            }
          }
        ])
        expect(result.flatMap(storedIdsIn)).toEqual([])
      })

      it('finds only the accreditation the key names', async () => {
        await insert(
          summaryLogFactory.submitted({ accreditationId: stored.previous.id })
        )
        const currentId = await insert(
          summaryLogFactory.submitted({ accreditationId: stored.current.id })
        )

        const result = await repo.findAll({
          ...stored.key,
          accreditationNumber: stored.current.accreditationNumber
        })

        expect(result.map(({ id }) => id)).toEqual([currentId])
      })

      it('counts a summary log stored before accreditations were recorded towards every accreditation', async () => {
        const unscopedId = await insert(
          withoutYear(summaryLogFactory.submitted())
        )

        const result = await repo.findAll({
          ...stored.key,
          accreditationNumber: stored.current.accreditationNumber
        })

        expect(result.map(({ id }) => id)).toEqual([unscopedId])
      })
    })
  })
}
