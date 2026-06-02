import { describe, beforeEach, expect } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createMockLogger } from '#test/mock-logger.js'
import { buildDraftPrn, buildAwaitingAuthorisationPrn } from './test-data.js'

/** @typedef {import('../port.js').PackagingRecyclingNotesRepository} PrnRepository */

export const testUpdateStatusBehaviour = (it) => {
  describe('updateStatus', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ prnRepository: PrnRepository }} */ { prnRepository }
      ) => {
        repository = prnRepository
      }
    )

    describe('basic behaviour', () => {
      it('updates the current status', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date()
        })

        expect(updated.status.currentStatus).toBe(
          PRN_STATUS.AWAITING_AUTHORISATION
        )
      })

      it('adds to status history', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date()
        })

        expect(updated.status.history).toHaveLength(2)
        expect(updated.status.history[1].status).toBe(
          PRN_STATUS.AWAITING_AUTHORISATION
        )
        expect(updated.status.history[1].by).toEqual({
          id: 'user-raiser',
          name: 'Raiser User'
        })
      })

      it('updates the updatedAt timestamp', async () => {
        const created = await repository.create(buildDraftPrn())
        const updateTime = new Date()

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: updateTime
        })

        expect(new Date(updated.updatedAt).getTime()).toBe(updateTime.getTime())
      })

      it('sets currentStatusAt to the transition timestamp', async () => {
        const created = await repository.create(buildDraftPrn())
        const updateTime = new Date()

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: updateTime
        })

        expect(new Date(updated.status.currentStatusAt).getTime()).toBe(
          updateTime.getTime()
        )
      })

      it('returns null when PRN not found', async () => {
        const result = await repository.updateStatus({
          id: '000000000000000000000000',
          version: 1,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-test', name: 'Test User' },
          updatedAt: new Date()
        })

        expect(result).toBeNull()
      })

      it('does not leak _id in returned PRN', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-test', name: 'Test User' },
          updatedAt: new Date()
        })

        expect(updated._id).toBeUndefined()
      })

      it('returns the updated PRN with id', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-test', name: 'Test User' },
          updatedAt: new Date()
        })

        expect(updated.id).toBe(created.id)
      })
    })

    describe('PRN number assignment', () => {
      it('sets prnNumber when provided', async () => {
        const created = await repository.create(buildAwaitingAuthorisationPrn())
        const prnNumber = `ER26${Date.now().toString().slice(-5)}X`

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: { id: 'user-issuer', name: 'Issuer User' },
          updatedAt: new Date(),
          prnNumber
        })

        expect(updated.prnNumber).toBe(prnNumber)
      })

      it('persists prnNumber so it can be retrieved', async () => {
        const created = await repository.create(buildAwaitingAuthorisationPrn())
        const prnNumber = `ER26${Date.now().toString().slice(-5)}Y`

        await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: { id: 'user-issuer', name: 'Issuer User' },
          updatedAt: new Date(),
          prnNumber
        })

        const found = await repository.findById(created.id)
        expect(found.prnNumber).toBe(prnNumber)
      })

      it('does not set prnNumber when not provided', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date()
        })

        expect(updated.prnNumber).toBeUndefined()
      })
    })

    describe('lastAppliedEventNumber watermark', () => {
      const seedWatermarkedPrn = async (lastAppliedEventNumber) => {
        const created = await repository.create(buildDraftPrn())
        return repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date(),
          lastAppliedEventNumber
        })
      }

      const reapplyWatermark = (prn, lastAppliedEventNumber) =>
        repository.updateStatus({
          id: prn.id,
          version: prn.version,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: { id: 'user-issuer', name: 'Issuer User' },
          updatedAt: new Date(),
          lastAppliedEventNumber
        })

      it('sets lastAppliedEventNumber when provided', async () => {
        const watermarked = await seedWatermarkedPrn(5)

        expect(watermarked.lastAppliedEventNumber).toBe(5)
      })

      it('persists lastAppliedEventNumber so it can be retrieved', async () => {
        const watermarked = await seedWatermarkedPrn(7)

        const found = await repository.findById(watermarked.id)
        expect(found.lastAppliedEventNumber).toBe(7)
      })

      it('does not set lastAppliedEventNumber when none is stored or provided', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date()
        })

        expect(updated.lastAppliedEventNumber).toBeUndefined()
      })

      it('re-applies an equal watermark', async () => {
        const watermarked = await seedWatermarkedPrn(5)

        const updated = await reapplyWatermark(watermarked, 5)

        expect(updated.lastAppliedEventNumber).toBe(5)
      })

      it('advances to a higher watermark', async () => {
        const watermarked = await seedWatermarkedPrn(5)

        const updated = await reapplyWatermark(watermarked, 9)

        expect(updated.lastAppliedEventNumber).toBe(9)
      })

      it('rejects a lower watermark as an internal error', async () => {
        const watermarked = await seedWatermarkedPrn(5)

        await expect(reapplyWatermark(watermarked, 3)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 500 }
        })
      })

      it('rejects an update that drops the watermark once one is set', async () => {
        const watermarked = await seedWatermarkedPrn(5)

        await expect(
          reapplyWatermark(watermarked, undefined)
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 500 },
          message: `Watermark regression: PRN ${watermarked.id} has applied event 5 but the update did not carry a watermark`
        })
      })

      it('leaves the PRN untouched when a watermark regression is rejected', async () => {
        const watermarked = await seedWatermarkedPrn(5)

        await reapplyWatermark(watermarked, 3).catch(() => {})

        const found = await repository.findById(watermarked.id)
        expect(found.lastAppliedEventNumber).toBe(5)
        expect(found.version).toBe(watermarked.version)
        expect(found.status.currentStatus).toBe(
          PRN_STATUS.AWAITING_AUTHORISATION
        )
      })

      it('describes the backwards move in the error message', async () => {
        const watermarked = await seedWatermarkedPrn(5)

        await expect(reapplyWatermark(watermarked, 3)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 500 },
          message: `Watermark regression: PRN ${watermarked.id} has applied event 5 but the update would move it back to 3`
        })
      })
    })

    describe('watermark regression logging', () => {
      it('logs watermark regression with database/watermark_regression_detected event metadata', async ({
        prnRepositoryFactory
      }) => {
        const logger = createMockLogger()
        const repo = prnRepositoryFactory(logger)
        const created = await repo.create(buildDraftPrn())
        const watermarked = await repo.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date(),
          lastAppliedEventNumber: 5
        })

        await expect(
          repo.updateStatus({
            id: created.id,
            version: watermarked.version,
            status: PRN_STATUS.AWAITING_ACCEPTANCE,
            updatedBy: { id: 'user-issuer', name: 'Issuer User' },
            updatedAt: new Date(),
            lastAppliedEventNumber: 3
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 500 }
        })

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            err: expect.any(Error),
            message: `Watermark regression detected for PRN ${created.id}`,
            event: {
              category: 'database',
              action: 'watermark_regression_detected',
              reference: created.id
            }
          })
        )
      })
    })

    describe('business operation slots', () => {
      it('sets the named operation slot when provided', async () => {
        const created = await repository.create(buildAwaitingAuthorisationPrn())
        const now = new Date()
        const actor = { id: 'user-issuer', name: 'Issuer User' }

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: actor,
          updatedAt: now,
          prnNumber: `ER26${Date.now().toString().slice(-5)}Q`,
          operation: { slot: 'issued', at: now, by: actor }
        })

        expect(new Date(updated.status.issued.at).getTime()).toBe(now.getTime())
        expect(updated.status.issued.by).toEqual(actor)
      })

      it('persists the operation slot so it can be retrieved', async () => {
        const created = await repository.create(buildAwaitingAuthorisationPrn())
        const now = new Date()
        const actor = {
          id: 'user-issuer',
          name: 'Issuer User',
          position: 'Manager'
        }

        await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: { id: 'user-issuer', name: 'Issuer User' },
          updatedAt: now,
          prnNumber: `ER26${Date.now().toString().slice(-5)}S`,
          operation: { slot: 'issued', at: now, by: actor }
        })

        const found = await repository.findById(created.id)
        expect(new Date(found.status.issued.at).getTime()).toBe(now.getTime())
        expect(found.status.issued.by).toEqual(actor)
      })

      it('does not add operation slot when not provided', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date()
        })

        expect(updated.status.issued).toBeUndefined()
      })
    })

    describe('multiple status transitions', () => {
      it('tracks full status history across transitions', async () => {
        const created = await repository.create(buildDraftPrn())

        const intermediate = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date()
        })

        const final = await repository.updateStatus({
          id: created.id,
          version: intermediate.version,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: { id: 'user-issuer', name: 'Issuer User' },
          updatedAt: new Date(),
          prnNumber: 'ER2600001X'
        })

        expect(final.status.history).toHaveLength(3)
        expect(final.status.history[0].status).toBe(PRN_STATUS.DRAFT)
        expect(final.status.history[1].status).toBe(
          PRN_STATUS.AWAITING_AUTHORISATION
        )
        expect(final.status.history[2].status).toBe(
          PRN_STATUS.AWAITING_ACCEPTANCE
        )
      })
    })
  })
}
