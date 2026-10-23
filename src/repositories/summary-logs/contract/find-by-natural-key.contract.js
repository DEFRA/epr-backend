import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { summaryLogFactory, withoutYear } from './test-data.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

/**
 * @import { TestAPI } from 'vitest'
 * @import { SummaryLog } from '#domain/summary-logs/model.js'
 * @import { SummaryLogKey } from '#domain/summary-logs/numbers.js'
 * @import { KeyedSummaryLogWithId, SummaryLogsRepository } from '../port.js'
 *
 * @typedef {{ summaryLogsRepository: SummaryLogsRepository }} NaturalKeyFixtures
 */

/** @param {string} prefix */
const uniqueNumber = (prefix) =>
  `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`

const uniqueOrganisationNumber = () =>
  toOrganisationNumber(String(Math.floor(Math.random() * 1e9) + 1))

/**
 * A registration with a current and a previous accreditation, named by its
 * numbers and by the ids its summary logs are stored under.
 */
const aRegistration = () => {
  /** @type {SummaryLogKey} */
  const key = {
    organisationNumber: uniqueOrganisationNumber(),
    registrationNumber: toRegistrationNumber(uniqueNumber('REG'))
  }
  return {
    key,
    ids: {
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString()
    },
    current: {
      id: new ObjectId().toString(),
      accreditationNumber: toAccreditationNumber(uniqueNumber('ACC'))
    },
    previous: {
      id: new ObjectId().toString(),
      accreditationNumber: toAccreditationNumber(uniqueNumber('ACC'))
    }
  }
}

const STORED_IDS = ['organisationId', 'registrationId', 'accreditationId']

/** @param {KeyedSummaryLogWithId | null} found */
const storedIdsIn = (found) =>
  STORED_IDS.filter((key) => found && key in found.summaryLog)

/** @param {TestAPI<NaturalKeyFixtures>} it */
export const testFindByNaturalKey = (it) => {
  describe('finding by natural key', () => {
    /** @type {SummaryLogsRepository} */
    let repo
    /** @type {ReturnType<typeof aRegistration>} */
    let stored

    beforeEach(
      async (/** @type {NaturalKeyFixtures} */ { summaryLogsRepository }) => {
        repo = summaryLogsRepository
        stored = aRegistration()
      }
    )

    /**
     * Stores a summary log under the registration's ids and numbers, as an
     * upload does.
     *
     * @param {Omit<SummaryLog, 'organisationId' | 'registrationId'>} summaryLog
     * @param {ReturnType<typeof aRegistration>} [registration]
     */
    const insert = async (summaryLog, registration = stored) => {
      const id = new ObjectId().toString()
      await repo.insert(id, {
        ...registration.ids,
        ...registration.key,
        ...summaryLog
      })
      return id
    }

    /** @param {{ id: string, accreditationNumber: import('#domain/organisations/numbers.js').AccreditationNumber }} accreditation */
    const accredited = ({ id, accreditationNumber }) => ({
      accreditationId: id,
      accreditationNumber
    })

    const registeredOnly = { accreditationId: null, accreditationNumber: null }

    describe('refusing a key without its numbers', () => {
      for (const missing of ['organisationNumber', 'registrationNumber']) {
        it(`refuses a key with no ${missing}`, async () => {
          await insert({
            ...summaryLogFactory.submitted(registeredOnly),
            [missing]: undefined
          })
          const key = { ...stored.key, [missing]: undefined }

          await expect(
            repo.findLatestSubmitted(/** @type {SummaryLogKey} */ (key))
          ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 422 } })
          await expect(
            repo.findAll(/** @type {SummaryLogKey} */ (key))
          ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 422 } })
        })
      }
    })

    describe('findLatestSubmitted', () => {
      it('returns null when no summary log holds the organisation number', async () => {
        await insert(summaryLogFactory.submitted(registeredOnly))

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          organisationNumber: uniqueOrganisationNumber()
        })

        expect(result).toBeNull()
      })

      it('returns null when no summary log holds the registration number', async () => {
        await insert(summaryLogFactory.submitted(registeredOnly))

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          registrationNumber: toRegistrationNumber(uniqueNumber('REG'))
        })

        expect(result).toBeNull()
      })

      it('returns null when the registration has no submitted summary log', async () => {
        for (const factory of [
          summaryLogFactory.preprocessing,
          summaryLogFactory.validating,
          summaryLogFactory.validated,
          summaryLogFactory.superseded,
          summaryLogFactory.rejected,
          summaryLogFactory.submitting
        ]) {
          await insert(factory(registeredOnly))
        }

        const result = await repo.findLatestSubmitted(stored.key)

        expect(result).toBeNull()
      })

      it('returns the latest submitted summary log, named by its numbers in place of its ids', async () => {
        await insert(
          summaryLogFactory.submitted({
            ...accredited(stored.current),
            submittedAt: '2026-02-15T10:00:00.000Z'
          })
        )
        const latestId = await insert(
          summaryLogFactory.submitted({
            ...accredited(stored.current),
            submittedAt: '2026-03-15T10:00:00.000Z'
          })
        )
        await insert(
          summaryLogFactory.submitted({
            ...accredited(stored.current),
            submittedAt: '2026-01-15T10:00:00.000Z'
          })
        )

        const result = await repo.findLatestSubmitted(stored.key)

        expect(result).toMatchObject({
          id: latestId,
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.SUBMITTED,
            submittedAt: '2026-03-15T10:00:00.000Z',
            organisationNumber: stored.key.organisationNumber,
            registrationNumber: stored.key.registrationNumber,
            accreditationNumber: stored.current.accreditationNumber
          }
        })
        expect(storedIdsIn(result)).toEqual([])
      })

      it("ignores another registration's summary logs", async () => {
        const other = aRegistration()
        const ownId = await insert(
          summaryLogFactory.submitted({
            ...registeredOnly,
            submittedAt: '2026-01-15T10:00:00.000Z'
          })
        )
        await insert(
          summaryLogFactory.submitted({
            ...registeredOnly,
            submittedAt: '2026-02-15T10:00:00.000Z'
          }),
          {
            ...other,
            key: {
              ...other.key,
              organisationNumber: stored.key.organisationNumber
            }
          }
        )

        const result = await repo.findLatestSubmitted(stored.key)

        expect(result?.id).toBe(ownId)
      })

      it('finds only the accreditation the key names', async () => {
        const previousId = await insert(
          summaryLogFactory.submitted({
            ...accredited(stored.previous),
            submittedAt: '2026-01-15T10:00:00.000Z'
          })
        )
        await insert(
          summaryLogFactory.submitted({
            ...accredited(stored.current),
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
            ...registeredOnly,
            submittedAt: '2026-01-15T10:00:00.000Z'
          })
        )
        await insert(
          summaryLogFactory.submitted({
            ...accredited(stored.current),
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

      it('returns null when no summary log holds the accreditation number', async () => {
        await insert(summaryLogFactory.submitted(accredited(stored.current)))

        const result = await repo.findLatestSubmitted({
          ...stored.key,
          accreditationNumber: toAccreditationNumber(uniqueNumber('ACC'))
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

      describe('in a year', () => {
        it('finds only the year the key names', async () => {
          const targetId = await insert(
            summaryLogFactory.submitted({
              ...accredited(stored.current),
              year: 2026,
              submittedAt: '2026-06-01T00:00:00.000Z'
            })
          )
          await insert(
            summaryLogFactory.submitted({
              ...accredited(stored.current),
              year: 2027,
              submittedAt: '2027-06-01T00:00:00.000Z'
            })
          )

          const result = await repo.findLatestSubmitted({
            ...stored.key,
            year: 2026,
            accreditationNumber: stored.current.accreditationNumber
          })

          expect(result?.id).toBe(targetId)
        })

        it('finds only the accreditation the key names within the year', async () => {
          const targetId = await insert(
            summaryLogFactory.submitted({
              ...registeredOnly,
              year: 2026,
              submittedAt: '2026-06-01T00:00:00.000Z'
            })
          )
          await insert(
            summaryLogFactory.submitted({
              ...accredited(stored.current),
              year: 2026,
              submittedAt: '2026-07-01T00:00:00.000Z'
            })
          )

          const result = await repo.findLatestSubmitted({
            ...stored.key,
            year: 2026,
            accreditationNumber: null
          })

          expect(result?.id).toBe(targetId)
        })

        it('counts a summary log stored with its year but before accreditations were recorded towards every accreditation in that year', async () => {
          const legacyId = await insert({
            ...withoutYear(summaryLogFactory.submitted()),
            year: 2026
          })

          const result = await repo.findLatestSubmitted({
            ...stored.key,
            year: 2026,
            accreditationNumber: stored.current.accreditationNumber
          })

          expect(result?.id).toBe(legacyId)
        })

        it('counts a summary log stored before years were recorded towards every year', async () => {
          const legacyId = await insert(
            withoutYear(summaryLogFactory.submitted())
          )

          const result = await repo.findLatestSubmitted({
            ...stored.key,
            year: 2026,
            accreditationNumber: null
          })

          expect(result?.id).toBe(legacyId)
        })
      })
    })

    describe('findAll', () => {
      it('returns an empty array when no summary log holds the organisation number', async () => {
        await insert(summaryLogFactory.submitted(registeredOnly))

        const result = await repo.findAll({
          ...stored.key,
          organisationNumber: uniqueOrganisationNumber()
        })

        expect(result).toEqual([])
      })

      it("returns the registration's submitted and failed summary logs, newest first, named by their numbers", async () => {
        const failedId = await insert(
          summaryLogFactory.validationFailed({
            ...accredited(stored.current),
            createdAt: '2026-03-01T10:00:00.000Z'
          })
        )
        const submittedId = await insert(
          summaryLogFactory.submitted({
            ...accredited(stored.previous),
            submittedAt: '2026-02-01T10:00:00.000Z'
          })
        )
        await insert(summaryLogFactory.validated(registeredOnly))

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
        await insert(summaryLogFactory.submitted(accredited(stored.previous)))
        const currentId = await insert(
          summaryLogFactory.submitted(accredited(stored.current))
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
