import assert from 'node:assert'
import { describe, beforeEach, expect } from 'vitest'
import { buildAwaitingAcceptancePrn } from './test-data.js'

/** @typedef {import('../port.js').PackagingRecyclingNotesRepository} PrnRepository */

/**
 * `updateWatermark` is the backfill primitive: it advances a projection's
 * `lastAppliedEventNumber` under the version CAS and the monotonic-watermark
 * guard, and touches nothing else. It exists so a benign watermark-behind
 * projection (status already correct, watermark never stamped) can be brought
 * current without churning `status`, `history`, `updatedAt` or `updatedBy` the
 * way a full fold would.
 */
export const testUpdateWatermarkBehaviour = (it) => {
  describe('updateWatermark', () => {
    /** @type {PrnRepository} */
    let repository

    beforeEach(
      async (
        /** @type {{ prnRepository: PrnRepository }} */ { prnRepository }
      ) => {
        repository = prnRepository
      }
    )

    it('stamps the watermark and bumps the version, leaving everything else untouched', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())

      const stamped = await repository.updateWatermark({
        id: created.id,
        version: created.version,
        lastAppliedEventNumber: 3
      })
      assert(stamped)

      expect(stamped.id).toBe(created.id)
      expect(stamped.version).toBe(created.version + 1)
      expect(stamped.lastAppliedEventNumber).toBe(3)
      // The point of the primitive: no status, history or audit churn.
      expect(stamped.status).toEqual(created.status)
      expect(stamped.updatedAt).toEqual(created.updatedAt)
      expect(stamped.updatedBy).toEqual(created.updatedBy)

      const refetched = await repository.findById(created.id)
      assert(refetched)
      expect(refetched.lastAppliedEventNumber).toBe(3)
      expect(refetched.status).toEqual(created.status)
    })

    it('returns null when no PRN exists with the given id', async () => {
      const result = await repository.updateWatermark({
        id: '000000000000000000000000',
        version: 1,
        lastAppliedEventNumber: 1
      })

      expect(result).toBeNull()
    })

    it('throws Boom.conflict when the expected version does not match', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())

      await expect(
        repository.updateWatermark({
          id: created.id,
          version: created.version + 99,
          lastAppliedEventNumber: 3
        })
      ).rejects.toThrow(/version/i)
    })

    it('rejects a watermark that regresses below the stored value', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())
      const stamped = await repository.updateWatermark({
        id: created.id,
        version: created.version,
        lastAppliedEventNumber: 5
      })
      assert(stamped)

      await expect(
        repository.updateWatermark({
          id: created.id,
          version: stamped.version,
          lastAppliedEventNumber: 4
        })
      ).rejects.toThrow()
    })
  })
}
