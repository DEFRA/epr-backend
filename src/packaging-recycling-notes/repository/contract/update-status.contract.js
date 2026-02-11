import { describe, beforeEach, expect } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { buildDraftPrn, buildAwaitingAuthorisationPrn } from './test-data.js'

export const testUpdateStatusBehaviour = (it) => {
  describe('updateStatus', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    describe('basic behaviour', () => {
      it('updates the current status', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await repository.updateStatus({
          id: created.id,
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
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-test', name: 'Test User' },
          updatedAt: new Date()
        })

        expect(result).toBeNull()
      })

      it('returns the updated PRN with id', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await repository.updateStatus({
          id: created.id,
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
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date()
        })

        expect(updated.prnNumber).toBeUndefined()
      })
    })

    describe('business operation slots', () => {
      it('sets the named operation slot when provided', async () => {
        const created = await repository.create(buildAwaitingAuthorisationPrn())
        const now = new Date()
        const actor = { id: 'user-issuer', name: 'Issuer User' }

        const updated = await repository.updateStatus({
          id: created.id,
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

        await repository.updateStatus({
          id: created.id,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'user-raiser', name: 'Raiser User' },
          updatedAt: new Date()
        })

        const final = await repository.updateStatus({
          id: created.id,
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
