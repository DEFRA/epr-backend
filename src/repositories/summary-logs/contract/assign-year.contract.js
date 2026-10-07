import { randomUUID } from 'node:crypto'
import { describe, beforeEach, expect } from 'vitest'
import { summaryLogFactory, withoutYear } from './test-data.js'
import { waitForVersion } from './test-helpers.js'

export const testAssignYear = (it) => {
  describe('assignYear', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ summaryLogsRepository: import('../port.js').SummaryLogsRepository }} */ {
          summaryLogsRepository
        }
      ) => {
        repository = summaryLogsRepository
      }
    )

    const insertLegacy = async () => {
      const id = `contract-legacy-${randomUUID()}`
      await repository.insert(id, withoutYear(summaryLogFactory.validating()))
      return id
    }

    it('lists only summary logs without a year', async () => {
      const legacyId = await insertLegacy()
      const scopedId = `contract-scoped-${randomUUID()}`
      await repository.insert(scopedId, summaryLogFactory.validating())

      const ids = await repository.findIdsWithoutYear()

      expect(ids).toContain(legacyId)
      expect(ids).not.toContain(scopedId)
    })

    it('sets the year, bumps the version and leaves other fields alone', async () => {
      const id = await insertLegacy()
      const before = await repository.findById(id)

      await repository.assignYear(id, before.version, 2026)

      const after = await waitForVersion(repository, id, before.version + 1)
      expect(after.summaryLog).toEqual({ ...before.summaryLog, year: 2026 })
      expect(await repository.findIdsWithoutYear()).not.toContain(id)
    })

    it('conflicts on a stale version', async () => {
      const id = await insertLegacy()

      await expect(repository.assignYear(id, 99, 2026)).rejects.toMatchObject({
        output: { statusCode: 409 }
      })
    })

    it('conflicts when the summary log already has a year', async () => {
      const id = `contract-scoped-${randomUUID()}`
      await repository.insert(id, summaryLogFactory.validating())

      await expect(repository.assignYear(id, 1, 2026)).rejects.toMatchObject({
        output: { statusCode: 409 }
      })
    })

    it('throws not found for an unknown id', async () => {
      await expect(
        repository.assignYear(`contract-missing-${randomUUID()}`, 1, 2026)
      ).rejects.toMatchObject({ output: { statusCode: 404 } })
    })

    it('rejects an invalid year', async () => {
      const id = await insertLegacy()

      await expect(repository.assignYear(id, 1, 1999)).rejects.toMatchObject({
        output: { statusCode: 422 }
      })
    })

    describe('lookups after the backfill', () => {
      const scopeFor = (ref, overrides) => ({
        organisationId: ref.organisationId,
        registrationId: ref.registrationId,
        year: 2026,
        accreditationId: null,
        ...overrides
      })

      const insertBackfilledSubmitted = async (ref) => {
        const id = `contract-backfilled-${randomUUID()}`
        await repository.insert(
          id,
          withoutYear(summaryLogFactory.submitted(ref))
        )
        const { version } = await repository.findById(id)
        await repository.assignYear(id, version, 2026)
        await waitForVersion(repository, id, version + 1)
        return id
      }

      const newRef = () => ({
        organisationId: `org-${randomUUID()}`,
        registrationId: `reg-${randomUUID()}`
      })

      const findBackfilled = async (accreditationId) => {
        const ref = newRef()
        const id = await insertBackfilledSubmitted(ref)
        const found = await repository.findLatestSubmittedForOrgReg(
          scopeFor(ref, { accreditationId })
        )
        return { id, found }
      }

      it('is found by an accredited scope for its year', async () => {
        const { id, found } = await findBackfilled('acc-1')

        expect(found?.id).toBe(id)
      })

      it('is found by a registered-only scope for its year', async () => {
        const { id, found } = await findBackfilled(null)

        expect(found?.id).toBe(id)
      })

      it('is not found for another year', async () => {
        const ref = newRef()
        await insertBackfilledSubmitted(ref)

        const found = await repository.findLatestSubmittedForOrgReg(
          scopeFor(ref, { year: 2027, accreditationId: 'acc-1' })
        )

        expect(found).toBeNull()
      })

      it('does not make a registered-only log match an accredited scope', async () => {
        const ref = newRef()
        await repository.insert(
          `contract-registered-only-${randomUUID()}`,
          summaryLogFactory.submitted({
            ...ref,
            year: 2026,
            accreditationId: null
          })
        )

        const found = await repository.findLatestSubmittedForOrgReg(
          scopeFor(ref, { accreditationId: 'acc-1' })
        )

        expect(found).toBeNull()
      })
    })
  })
}
