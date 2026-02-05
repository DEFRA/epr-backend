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
          issuedByOrganisation: 'org-test-123',
          tonnage: 250.75,
          material: 'glass'
        })

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found).toBeTruthy()
        expect(found.issuedByOrganisation).toBe('org-test-123')
        expect(found.tonnage).toBe(250.75)
        expect(found.material).toBe('glass')
      })

      it('preserves all fields when creating', async () => {
        const now = new Date()
        const prnInput = buildPrn({
          issuedByOrganisation: 'org-preserve-test',
          issuedByAccreditation: 'acc-preserve-test',
          issuedToOrganisation: 'recipient-preserve-test',
          tonnage: 500,
          material: 'paper',
          regulator: 'sepa',
          wasteProcessingType: 'exporting',
          isExport: true,
          issuerNotes: 'Test notes for contract',
          createdBy: 'user-contract-test',
          createdAt: now,
          updatedAt: now
        })

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found.issuedByOrganisation).toBe('org-preserve-test')
        expect(found.issuedByAccreditation).toBe('acc-preserve-test')
        expect(found.issuedToOrganisation).toBe('recipient-preserve-test')
        expect(found.tonnage).toBe(500)
        expect(found.material).toBe('paper')
        expect(found.regulator).toBe('sepa')
        expect(found.wasteProcessingType).toBe('exporting')
        expect(found.isExport).toBe(true)
        expect(found.issuerNotes).toBe('Test notes for contract')
        expect(found.createdBy).toBe('user-contract-test')
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
      it('allows issuerNotes to be undefined', async () => {
        const prnInput = buildDraftPrn()
        delete prnInput.issuerNotes

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found.issuerNotes).toBeUndefined()
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
