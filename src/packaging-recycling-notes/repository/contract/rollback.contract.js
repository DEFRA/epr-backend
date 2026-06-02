import { describe, beforeEach, expect } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createMockLogger } from '#test/mock-logger.js'
import {
  buildAwaitingAuthorisationPrn,
  buildAwaitingAcceptancePrn,
  buildCancelledPrn,
  buildDeletedPrn
} from './test-data.js'

const compensator = { id: 'user-compensator', name: 'Compensator User' }

const buildCancelledFromAwaitingCancellation = (overrides = {}) =>
  buildCancelledPrn({
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.CANCELLED,
      ...overrides.status
    }
  })

export const testRollbackBehaviour = (it) => {
  describe('rollbackIssuance', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    it('reverts status from AWAITING_ACCEPTANCE back to AWAITING_AUTHORISATION', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())

      const rolledBack = await repository.rollbackIssuance({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
    })

    it('unsets the prnNumber', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())

      const rolledBack = await repository.rollbackIssuance({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.prnNumber).toBeUndefined()
    })

    it('unsets the issued operation slot', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())

      const rolledBack = await repository.rollbackIssuance({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.issued).toBeUndefined()
    })

    it('bumps the version', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())

      const rolledBack = await repository.rollbackIssuance({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.version).toBe(created.version + 1)
    })

    it('appends a history entry recording the reverted status', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())
      const previousLength = created.status.history.length

      const rolledBack = await repository.rollbackIssuance({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.history).toHaveLength(previousLength + 1)
      expect(rolledBack.status.history.at(-1)).toMatchObject({
        status: PRN_STATUS.AWAITING_AUTHORISATION,
        by: compensator
      })
    })

    it('throws Boom.conflict when the expected version is stale', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())

      await repository.rollbackIssuance({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      await expect(
        repository.rollbackIssuance({
          id: created.id,
          expectedVersion: created.version,
          updatedBy: compensator,
          updatedAt: new Date()
        })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 }
      })
    })

    it('returns null when the PRN does not exist', async () => {
      const result = await repository.rollbackIssuance({
        id: '507f1f77bcf86cd799439011',
        expectedVersion: 1,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(result).toBeNull()
    })

    it('persists the rollback so a fresh read sees the reverted state', async () => {
      const created = await repository.create(buildAwaitingAcceptancePrn())

      await repository.rollbackIssuance({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      const found = await repository.findById(created.id)

      expect(found.status.currentStatus).toBe(PRN_STATUS.AWAITING_AUTHORISATION)
      expect(found.prnNumber).toBeUndefined()
      expect(found.status.issued).toBeUndefined()
    })

    it('logs the version conflict via the repository logger', async ({
      prnRepositoryFactory
    }) => {
      const logger = createMockLogger()
      const repo = prnRepositoryFactory(logger)
      const created = await repo.create(buildAwaitingAcceptancePrn())

      await repo.rollbackIssuance({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      await expect(
        repo.rollbackIssuance({
          id: created.id,
          expectedVersion: created.version,
          updatedBy: compensator,
          updatedAt: new Date()
        })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 }
      })

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          event: expect.objectContaining({
            category: 'database',
            action: 'version_conflict_detected',
            reference: created.id
          })
        })
      )
    })

    describe('lastAppliedEventNumber watermark', () => {
      const seedWatermarked = (lastAppliedEventNumber) =>
        repository.create(
          buildAwaitingAcceptancePrn({ lastAppliedEventNumber })
        )

      const rollback = (prn, lastAppliedEventNumber) =>
        repository.rollbackIssuance({
          id: prn.id,
          expectedVersion: prn.version,
          updatedBy: compensator,
          updatedAt: new Date(),
          lastAppliedEventNumber
        })

      it('carries an equal watermark forward', async () => {
        const created = await seedWatermarked(5)

        const rolledBack = await rollback(created, 5)

        expect(rolledBack.lastAppliedEventNumber).toBe(5)
      })

      it('advances to a higher watermark', async () => {
        const created = await seedWatermarked(5)

        const rolledBack = await rollback(created, 9)

        expect(rolledBack.lastAppliedEventNumber).toBe(9)
      })

      it('rejects a lower watermark as an internal error', async () => {
        const created = await seedWatermarked(5)

        await expect(rollback(created, 3)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 500 },
          message: `Watermark regression: PRN ${created.id} has applied event 5 but the update would move it back to 3`
        })
      })

      it('rejects a rollback that drops the watermark once one is set', async () => {
        const created = await seedWatermarked(5)

        await expect(rollback(created, undefined)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 500 },
          message: `Watermark regression: PRN ${created.id} has applied event 5 but the update did not carry a watermark`
        })
      })

      it('leaves the watermark untouched when a rollback is rejected', async () => {
        const created = await seedWatermarked(5)

        await rollback(created, 3).catch(() => {})

        const found = await repository.findById(created.id)
        expect(found.lastAppliedEventNumber).toBe(5)
        expect(found.version).toBe(created.version)
        expect(found.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      })
    })
  })

  describe('rollbackPendingCancellation', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    it('reverts status from CANCELLED to AWAITING_AUTHORISATION', async () => {
      const created = await repository.create(
        buildAwaitingAuthorisationPrn({
          status: {
            currentStatus: PRN_STATUS.CANCELLED,
            cancelled: {
              at: new Date(),
              by: { id: 'user-canceller', name: 'Canceller User' }
            }
          }
        })
      )

      const rolledBack = await repository.rollbackPendingCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
    })

    it('reverts status from DELETED to AWAITING_AUTHORISATION', async () => {
      const created = await repository.create(buildDeletedPrn())

      const rolledBack = await repository.rollbackPendingCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
    })

    it('unsets the cancelled operation slot when rolling back from CANCELLED', async () => {
      const created = await repository.create(
        buildAwaitingAuthorisationPrn({
          status: {
            currentStatus: PRN_STATUS.CANCELLED,
            cancelled: {
              at: new Date(),
              by: { id: 'user-canceller', name: 'Canceller User' }
            }
          }
        })
      )

      const rolledBack = await repository.rollbackPendingCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.cancelled).toBeUndefined()
    })

    it('unsets the deleted operation slot when rolling back from DELETED', async () => {
      const created = await repository.create(buildDeletedPrn())

      const rolledBack = await repository.rollbackPendingCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.deleted).toBeUndefined()
    })

    it('bumps the version', async () => {
      const created = await repository.create(buildDeletedPrn())

      const rolledBack = await repository.rollbackPendingCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.version).toBe(created.version + 1)
    })

    it('throws Boom.conflict when the expected version is stale', async () => {
      const created = await repository.create(buildDeletedPrn())

      await repository.rollbackPendingCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      await expect(
        repository.rollbackPendingCancellation({
          id: created.id,
          expectedVersion: created.version,
          updatedBy: compensator,
          updatedAt: new Date()
        })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 }
      })
    })

    it('returns null when the PRN does not exist', async () => {
      const result = await repository.rollbackPendingCancellation({
        id: '507f1f77bcf86cd799439011',
        expectedVersion: 1,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(result).toBeNull()
    })

    it('persists the rollback so a fresh read sees the reverted state', async () => {
      const created = await repository.create(buildDeletedPrn())

      await repository.rollbackPendingCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      const found = await repository.findById(created.id)

      expect(found.status.currentStatus).toBe(PRN_STATUS.AWAITING_AUTHORISATION)
      expect(found.status.deleted).toBeUndefined()
    })
  })

  describe('rollbackIssuedCancellation', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    it('reverts status from CANCELLED to AWAITING_CANCELLATION', async () => {
      const created = await repository.create(
        buildCancelledFromAwaitingCancellation()
      )

      const rolledBack = await repository.rollbackIssuedCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_CANCELLATION
      )
    })

    it('unsets the cancelled operation slot', async () => {
      const created = await repository.create(
        buildCancelledFromAwaitingCancellation()
      )

      const rolledBack = await repository.rollbackIssuedCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.cancelled).toBeUndefined()
    })

    it('preserves the issued operation slot', async () => {
      const created = await repository.create(
        buildCancelledFromAwaitingCancellation()
      )

      const rolledBack = await repository.rollbackIssuedCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.status.issued).toBeDefined()
      expect(rolledBack.prnNumber).toBeDefined()
    })

    it('bumps the version', async () => {
      const created = await repository.create(
        buildCancelledFromAwaitingCancellation()
      )

      const rolledBack = await repository.rollbackIssuedCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(rolledBack.version).toBe(created.version + 1)
    })

    it('throws Boom.conflict when the expected version is stale', async () => {
      const created = await repository.create(
        buildCancelledFromAwaitingCancellation()
      )

      await repository.rollbackIssuedCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      await expect(
        repository.rollbackIssuedCancellation({
          id: created.id,
          expectedVersion: created.version,
          updatedBy: compensator,
          updatedAt: new Date()
        })
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 }
      })
    })

    it('returns null when the PRN does not exist', async () => {
      const result = await repository.rollbackIssuedCancellation({
        id: '507f1f77bcf86cd799439011',
        expectedVersion: 1,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      expect(result).toBeNull()
    })

    it('persists the rollback so a fresh read sees the reverted state', async () => {
      const created = await repository.create(
        buildCancelledFromAwaitingCancellation()
      )

      await repository.rollbackIssuedCancellation({
        id: created.id,
        expectedVersion: created.version,
        updatedBy: compensator,
        updatedAt: new Date()
      })

      const found = await repository.findById(created.id)

      expect(found.status.currentStatus).toBe(PRN_STATUS.AWAITING_CANCELLATION)
      expect(found.status.cancelled).toBeUndefined()
    })
  })
}
