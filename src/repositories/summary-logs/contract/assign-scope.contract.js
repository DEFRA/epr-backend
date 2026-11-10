import { randomUUID } from 'node:crypto'
import { describe, beforeEach, expect } from 'vitest'
import { summaryLogFactory, withoutAccreditationId } from './test-data.js'
import { waitForVersion } from './test-helpers.js'
import { toSummaryLogId } from '#domain/summary-logs/ids.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { toYear } from '#common/helpers/dates/year.js'

/** @import { SummaryLogsRepository } from '../port.js' */
/** @import { InsertStoredSummaryLog } from './test-data.js' */

const accredited = {
  accreditationId: 'acc-scope',
  accreditationNumber: toAccreditationNumber('ACC-SCOPE')
}

const registeredOnly = { accreditationId: null, accreditationNumber: null }

/**
 * @typedef {{
 *   summaryLogsRepository: SummaryLogsRepository,
 *   insertStoredSummaryLog: InsertStoredSummaryLog
 * }} AssignScopeFixtures
 */

export const testAssignScope = (it) => {
  describe('assignScope', () => {
    /** @type {SummaryLogsRepository} */
    let repository
    /** @type {AssignScopeFixtures['insertStoredSummaryLog']} */
    let insertStored

    beforeEach(
      async (
        /** @type {AssignScopeFixtures} */ {
          summaryLogsRepository,
          insertStoredSummaryLog
        }
      ) => {
        repository = summaryLogsRepository
        insertStored = insertStoredSummaryLog
      }
    )

    const newId = () => toSummaryLogId(`contract-scope-${randomUUID()}`)

    /** Stored before summary logs were scoped by accreditation and year. */
    const insertUnscoped = async () => {
      const id = newId()
      const { year: _year, ...unscoped } = withoutAccreditationId(
        summaryLogFactory.submitted()
      )
      await insertStored(id, unscoped)
      return id
    }

    const insertWithoutAccreditation = async () => {
      const id = newId()
      await repository.insert(
        id,
        withoutAccreditationId(summaryLogFactory.submitted())
      )
      return id
    }

    describe('findIdsWithoutScope', () => {
      it('lists a summary log stored without its accreditation or year', async () => {
        const id = await insertUnscoped()

        expect(await repository.findIdsWithoutScope()).toContain(id)
      })

      it('lists a summary log stored with a year but no accreditation', async () => {
        const id = await insertWithoutAccreditation()

        expect(await repository.findIdsWithoutScope()).toContain(id)
      })

      it('does not list a summary log holding its accreditation and year', async () => {
        const accreditedId = newId()
        await repository.insert(
          accreditedId,
          summaryLogFactory.submitted({ accreditationId: 'acc-1' })
        )
        const registeredOnlyId = newId()
        await repository.insert(
          registeredOnlyId,
          summaryLogFactory.submitted({ accreditationId: null })
        )

        const ids = await repository.findIdsWithoutScope()

        expect(ids).not.toContain(accreditedId)
        expect(ids).not.toContain(registeredOnlyId)
      })
    })

    it('sets the accreditation, bumps the version and leaves other fields alone', async () => {
      const id = await insertWithoutAccreditation()
      const before = await waitForVersion(repository, id, 1)

      await repository.assignScope(id, 1, accredited)

      const after = await waitForVersion(repository, id, 2)
      expect(after.summaryLog).toEqual({ ...before.summaryLog, ...accredited })
      expect(await repository.findIdsWithoutScope()).not.toContain(id)
    })

    it('sets a registered-only accreditation and a year on a summary log holding neither', async () => {
      const id = await insertUnscoped()

      await repository.assignScope(id, 1, {
        ...registeredOnly,
        year: toYear(2026)
      })

      const after = await waitForVersion(repository, id, 2)
      expect(after.summaryLog).toMatchObject({
        ...registeredOnly,
        year: toYear(2026)
      })
      expect(await repository.findIdsWithoutScope()).not.toContain(id)
    })

    it('sets the year alone, leaving the summary log listed for its accreditation', async () => {
      const id = await insertUnscoped()

      await repository.assignScope(id, 1, { year: toYear(2026) })

      const after = await waitForVersion(repository, id, 2)
      expect(after.summaryLog.year).toBe(2026)
      expect(after.summaryLog).not.toHaveProperty('accreditationNumber')
      expect(await repository.findIdsWithoutScope()).toContain(id)
    })

    it('conflicts on a stale version', async () => {
      const id = await insertWithoutAccreditation()

      await expect(
        repository.assignScope(id, 99, accredited)
      ).rejects.toMatchObject({ output: { statusCode: 409 } })
    })

    it('conflicts rather than overwrite a field already held', async () => {
      const id = await insertWithoutAccreditation()
      const before = await waitForVersion(repository, id, 1)

      await expect(
        repository.assignScope(id, 1, { ...accredited, year: toYear(2027) })
      ).rejects.toMatchObject({ output: { statusCode: 409 } })
      expect((await repository.findById(id))?.summaryLog).toEqual(
        before.summaryLog
      )
    })

    it('throws not found for an unknown id', async () => {
      await expect(
        repository.assignScope(newId(), 1, accredited)
      ).rejects.toMatchObject({ output: { statusCode: 404 } })
    })

    for (const [description, invalid] of [
      ['nothing to assign', {}],
      ['an unknown field', { status: 'submitted' }],
      ['an accreditation id without its number', { accreditationId: 'acc-1' }],
      [
        'an accreditation number without its id',
        { accreditationNumber: 'ACC-1' }
      ],
      [
        'a null accreditation id beside a number',
        { accreditationId: null, accreditationNumber: 'ACC-1' }
      ],
      [
        'an accreditation id beside a null number',
        { accreditationId: 'acc-1', accreditationNumber: null }
      ],
      ['a year out of range', { year: 1999 }]
    ]) {
      it(`rejects ${description}`, async () => {
        const id = await insertWithoutAccreditation()

        await expect(
          repository.assignScope(id, 1, /** @type {any} */ (invalid))
        ).rejects.toMatchObject({ output: { statusCode: 422 } })
      })
    }
  })
}
