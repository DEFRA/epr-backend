import { describe, beforeEach, expect } from 'vitest'
import { buildPrn, buildDraftPrn } from './test-data.js'

export const testCreateBehaviour = (it) => {
  describe('create', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    describe('basic behaviour', () => {
      it('creates a PRN and returns it with an id', async () => {
        const prnInput = buildDraftPrn()

        const result = await repository.create(prnInput)

        expect(result.id).toBeDefined()
        expect(typeof result.id).toBe('string')
        expect(result.id.length).toBeGreaterThan(0)
      })

      it('stores the PRN so it can be retrieved', async () => {
        const prnInput = buildDraftPrn({
          organisationId: 'org-test-123',
          tonnage: 250.75,
          material: 'glass'
        })

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found).toBeTruthy()
        expect(found.organisationId).toBe('org-test-123')
        expect(found.tonnage).toBe(250.75)
        expect(found.material).toBe('glass')
      })

      it('preserves all fields when creating', async () => {
        const now = new Date()
        const prnInput = buildPrn({
          organisationId: 'org-preserve-test',
          accreditationId: 'acc-preserve-test',
          issuedToOrganisation: {
            id: 'recipient-preserve-test',
            name: 'Recipient Org',
            tradingName: 'Recipient Trading'
          },
          tonnage: 500,
          material: 'paper',
          isExport: true,
          notes: 'Test notes for contract',
          createdBy: { id: 'user-contract-test', name: 'Contract User' },
          createdAt: now,
          updatedAt: now
        })

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found.organisationId).toBe('org-preserve-test')
        expect(found.accreditationId).toBe('acc-preserve-test')
        expect(found.issuedToOrganisation).toStrictEqual({
          id: 'recipient-preserve-test',
          name: 'Recipient Org',
          tradingName: 'Recipient Trading'
        })
        expect(found.tonnage).toBe(500)
        expect(found.material).toBe('paper')
        expect(found.isExport).toBe(true)
        expect(found.notes).toBe('Test notes for contract')
        expect(found.createdBy).toStrictEqual({
          id: 'user-contract-test',
          name: 'Contract User'
        })
      })

      it('preserves status history when creating', async () => {
        const prnInput = buildDraftPrn()

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found.status.currentStatus).toBe('draft')
        expect(found.status.history).toHaveLength(1)
        expect(found.status.history[0].status).toBe('draft')
      })

      it('generates unique ids for each created PRN', async () => {
        const prn1 = await repository.create(buildDraftPrn())
        const prn2 = await repository.create(buildDraftPrn())

        expect(prn1.id).not.toBe(prn2.id)
      })
    })

    describe('optional fields', () => {
      it('allows notes to be undefined', async () => {
        const prnInput = buildDraftPrn()
        delete prnInput.notes

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found.notes).toBeUndefined()
      })

      it('allows prnNumber to be undefined initially', async () => {
        const prnInput = buildDraftPrn()

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found.prnNumber).toBeUndefined()
      })
    })
  })
}
