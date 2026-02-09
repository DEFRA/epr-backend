import { describe, beforeEach, expect } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { PrnNumberConflictError } from '../port.js'
import { buildAwaitingAuthorisationPrn } from './test-data.js'

export const testPrnNumberUniqueness = (it) => {
  describe('PRN number uniqueness', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    describe('unique constraint', () => {
      it('throws PrnNumberConflictError when prnNumber already exists', async () => {
        const prnNumber = `ER26UNIQUE${Date.now()}`
        const prn1 = await repository.create(buildAwaitingAuthorisationPrn())
        const prn2 = await repository.create(buildAwaitingAuthorisationPrn())

        await repository.updateStatus({
          id: prn1.id,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: 'user-issuer',
          updatedAt: new Date(),
          prnNumber
        })

        await expect(
          repository.updateStatus({
            id: prn2.id,
            status: PRN_STATUS.AWAITING_ACCEPTANCE,
            updatedBy: 'user-issuer',
            updatedAt: new Date(),
            prnNumber
          })
        ).rejects.toThrow(PrnNumberConflictError)
      })

      it('allows different PRN numbers on different PRNs', async () => {
        const prn1 = await repository.create(buildAwaitingAuthorisationPrn())
        const prn2 = await repository.create(buildAwaitingAuthorisationPrn())
        const now = Date.now()

        const updated1 = await repository.updateStatus({
          id: prn1.id,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: 'user-issuer',
          updatedAt: new Date(),
          prnNumber: `ER26DIFF1${now}`
        })

        const updated2 = await repository.updateStatus({
          id: prn2.id,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: 'user-issuer',
          updatedAt: new Date(),
          prnNumber: `ER26DIFF2${now}`
        })

        expect(updated1.prnNumber).toBe(`ER26DIFF1${now}`)
        expect(updated2.prnNumber).toBe(`ER26DIFF2${now}`)
      })

      it('allows null prnNumber on multiple PRNs (sparse index)', async () => {
        const prn1 = await repository.create(buildAwaitingAuthorisationPrn())
        const prn2 = await repository.create(buildAwaitingAuthorisationPrn())

        const updated1 = await repository.updateStatus({
          id: prn1.id,
          status: PRN_STATUS.CANCELLED,
          updatedBy: 'user-canceller',
          updatedAt: new Date()
        })

        const updated2 = await repository.updateStatus({
          id: prn2.id,
          status: PRN_STATUS.CANCELLED,
          updatedBy: 'user-canceller',
          updatedAt: new Date()
        })

        expect(updated1.prnNumber).toBeUndefined()
        expect(updated2.prnNumber).toBeUndefined()
      })
    })

    describe('conflict error details', () => {
      it('includes the conflicting PRN number in the error', async () => {
        const prnNumber = `ER26CONFLICT${Date.now()}`
        const prn1 = await repository.create(buildAwaitingAuthorisationPrn())
        const prn2 = await repository.create(buildAwaitingAuthorisationPrn())

        await repository.updateStatus({
          id: prn1.id,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: 'user-issuer',
          updatedAt: new Date(),
          prnNumber
        })

        const error = await repository
          .updateStatus({
            id: prn2.id,
            status: PRN_STATUS.AWAITING_ACCEPTANCE,
            updatedBy: 'user-issuer',
            updatedAt: new Date(),
            prnNumber
          })
          .catch((e) => e)

        expect(error).toBeInstanceOf(PrnNumberConflictError)
        expect(error.prnNumber).toBe(prnNumber)
        expect(error.message).toContain(prnNumber)
      })
    })
  })
}
