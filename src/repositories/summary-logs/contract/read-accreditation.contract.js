import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect } from 'vitest'
import { toSummaryLogId } from '#domain/summary-logs/ids.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { summaryLogFactory, withoutAccreditationId } from './test-data.js'

/**
 * @import { TestAPI } from 'vitest'
 * @import { SummaryLogsRepository } from '../port.js'
 *
 * @typedef {{ summaryLogsRepository: SummaryLogsRepository }} ReadAccreditationFixtures
 */

const SHAPES = [
  {
    name: 'uploaded for an accreditation',
    stored: {
      accreditationId: 'acc-read-back',
      accreditationNumber: toAccreditationNumber('ACC-READ-BACK')
    },
    read: { accreditationNumber: 'ACC-READ-BACK' }
  },
  {
    name: 'uploaded registered only',
    stored: { accreditationId: null, accreditationNumber: null },
    read: { accreditationNumber: null }
  }
]

const ACCREDITATION_FIELDS = new Set(['accreditationId', 'accreditationNumber'])

/** @param {object | undefined} summaryLog */
const accreditationOf = (summaryLog) =>
  Object.fromEntries(
    Object.entries({ ...summaryLog }).filter(([key]) =>
      ACCREDITATION_FIELDS.has(key)
    )
  )

const aRegistration = () => ({
  organisationId: `org-${randomUUID()}`,
  registrationId: `reg-${randomUUID()}`
})

/** @param {{ organisationNumber: any, registrationNumber: any }} summaryLog */
const keyOf = ({ organisationNumber, registrationNumber }) => ({
  organisationNumber,
  registrationNumber
})

/** @param {TestAPI<ReadAccreditationFixtures>} it */
export const testReadAccreditation = (it) => {
  describe('reading the accreditation a summary log was uploaded for', () => {
    /** @type {SummaryLogsRepository} */
    let repository

    beforeEach(
      async (
        /** @type {ReadAccreditationFixtures} */ { summaryLogsRepository }
      ) => {
        repository = summaryLogsRepository
      }
    )

    /** @param {object} summaryLog */
    const insert = async (summaryLog) => {
      const id = toSummaryLogId(`contract-read-${randomUUID()}`)
      await repository.insert(id, /** @type {any} */ (summaryLog))
      return id
    }

    for (const shape of SHAPES) {
      describe(`${shape.name}`, () => {
        it('is found by id with its accreditation number and no accreditation id', async () => {
          const id = await insert(
            summaryLogFactory.submitted({ ...aRegistration(), ...shape.stored })
          )

          const found = await repository.findById(id)

          expect(accreditationOf(found?.summaryLog)).toEqual(shape.read)
        })

        it('is found by file id with its accreditation number and no accreditation id', async () => {
          const summaryLog = summaryLogFactory.submitted({
            ...aRegistration(),
            ...shape.stored
          })
          await insert(summaryLog)

          const found = await repository.findByFileId(summaryLog.file.id)

          expect(accreditationOf(found?.summaryLog)).toEqual(shape.read)
        })

        it('is found by its registration with its accreditation number and no accreditation id', async () => {
          const summaryLog = summaryLogFactory.submitted({
            ...aRegistration(),
            ...shape.stored
          })
          await insert(summaryLog)

          const latest = await repository.findLatestSubmitted(keyOf(summaryLog))
          const all = await repository.findAll(keyOf(summaryLog))

          expect(accreditationOf(latest?.summaryLog)).toEqual(shape.read)
          expect(all.map((found) => accreditationOf(found.summaryLog))).toEqual(
            [shape.read]
          )
        })

        it('is returned by a submitting transition with its accreditation number and no accreditation id', async () => {
          const id = await insert(
            summaryLogFactory.validated({ ...aRegistration(), ...shape.stored })
          )

          const result = await repository.transitionToSubmittingExclusive(id)

          expect(result).toMatchObject({
            success: true,
            summaryLog: shape.read
          })
          expect(result).not.toHaveProperty('summaryLog.accreditationId')
        })

        it('signs a download naming its accreditation number', async () => {
          const id = await insert(
            summaryLogFactory.submitted({ ...aRegistration(), ...shape.stored })
          )

          const result = await repository.getDownloadUrl(id)

          expect(result.accreditationNumber).toEqual(
            shape.read.accreditationNumber
          )
        })
      })
    }

    describe('a summary log that records no accreditation', () => {
      const recordingNone = () =>
        withoutAccreditationId(
          summaryLogFactory.validated({ ...aRegistration() })
        )

      it('is not found by id or by file id', async () => {
        const summaryLog = recordingNone()
        const id = await insert(summaryLog)

        expect(await repository.findById(id)).toBeNull()
        expect(await repository.findByFileId(summaryLog.file.id)).toBeNull()
      })

      it('is not found by its registration, whichever accreditation the key names', async () => {
        const summaryLog = withoutAccreditationId(
          summaryLogFactory.submitted({ ...aRegistration() })
        )
        await insert(summaryLog)

        for (const accreditationNumber of [undefined, null]) {
          const key = {
            ...keyOf(summaryLog),
            ...(accreditationNumber !== undefined && { accreditationNumber })
          }
          expect(await repository.findLatestSubmitted(key)).toBeNull()
          expect(await repository.findAll(key)).toEqual([])
        }
      })

      it('cannot be submitted', async () => {
        const id = await insert(recordingNone())

        await expect(
          repository.transitionToSubmittingExclusive(id)
        ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
      })

      it('has no download to sign', async () => {
        const id = await insert(
          withoutAccreditationId(
            summaryLogFactory.submitted({ ...aRegistration() })
          )
        )

        await expect(repository.getDownloadUrl(id)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 404 }
        })
      })
    })
  })
}
