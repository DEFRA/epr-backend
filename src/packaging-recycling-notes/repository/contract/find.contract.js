import { describe, beforeEach, expect } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildDraftPrn,
  buildDeletedPrn,
  buildAwaitingAcceptancePrn
} from './test-data.js'

export const testFindBehaviour = (it) => {
  describe('find', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    describe('findById', () => {
      it('returns null when id not found', async () => {
        const result = await repository.findById('000000000000000000000000')

        expect(result).toBeNull()
      })

      it('retrieves a PRN by id after create', async () => {
        const prnInput = buildDraftPrn({
          organisation: { id: 'org-find-test', name: 'Find Test Org' },
          tonnage: 123.45
        })

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found).toBeTruthy()
        expect(found.id).toBe(created.id)
        expect(found.organisation.id).toBe('org-find-test')
        expect(found.tonnage).toBe(123.45)
      })

      it('does not return PRNs with different ids', async () => {
        const prn1 = await repository.create(
          buildDraftPrn({
            organisation: { id: 'org-A', name: 'Org A' }
          })
        )
        await repository.create(
          buildDraftPrn({
            organisation: { id: 'org-B', name: 'Org B' }
          })
        )

        const found = await repository.findById(prn1.id)

        expect(found.organisation.id).toBe('org-A')
      })
    })

    describe('findByPrnNumber', () => {
      it('returns null when PRN number not found', async () => {
        const result = await repository.findByPrnNumber('NONEXISTENT001')

        expect(result).toBeNull()
      })

      it('retrieves a PRN by its PRN number', async () => {
        const prnInput = buildAwaitingAcceptancePrn({
          prnNumber: `FIND-${Date.now()}`
        })

        const created = await repository.create(prnInput)
        const found = await repository.findByPrnNumber(created.prnNumber)

        expect(found).toBeTruthy()
        expect(found.id).toBe(created.id)
        expect(found.prnNumber).toBe(created.prnNumber)
      })

      it('returns PRN with correct status', async () => {
        const prnNumber = `STATUS-${Date.now()}`
        await repository.create(buildAwaitingAcceptancePrn({ prnNumber }))

        const found = await repository.findByPrnNumber(prnNumber)

        expect(found.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      })

      it('does not return PRNs with different PRN numbers', async () => {
        const prnNumber1 = `A-${Date.now()}`
        const prnNumber2 = `B-${Date.now()}`

        await repository.create(
          buildAwaitingAcceptancePrn({
            prnNumber: prnNumber1,
            tonnage: 100
          })
        )
        await repository.create(
          buildAwaitingAcceptancePrn({
            prnNumber: prnNumber2,
            tonnage: 200
          })
        )

        const found = await repository.findByPrnNumber(prnNumber1)

        expect(found.tonnage).toBe(100)
      })
    })

    describe('findByPrnNumber', () => {
      it('does not leak _id in returned PRN', async () => {
        const prnNumber = `NOID-${Date.now()}`
        await repository.create(buildAwaitingAcceptancePrn({ prnNumber }))

        const found = await repository.findByPrnNumber(prnNumber)

        expect(found._id).toBeUndefined()
      })
    })

    describe('findByAccreditation', () => {
      it('returns empty array when no PRNs for accreditation', async () => {
        const result = await repository.findByAccreditation(
          'acc-nonexistent-123'
        )

        expect(result).toEqual([])
      })

      it('returns all PRNs for the specified accreditation', async () => {
        const accreditationId = `acc-findby-${Date.now()}`

        await repository.create(
          buildDraftPrn({
            accreditation: {
              id: accreditationId,
              accreditationNumber: 'ACC-1',
              accreditationYear: 2026,
              material: 'plastic',
              submittedToRegulator: 'ea',
              siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
            },
            tonnage: 100
          })
        )
        await repository.create(
          buildDraftPrn({
            accreditation: {
              id: accreditationId,
              accreditationNumber: 'ACC-2',
              accreditationYear: 2026,
              material: 'plastic',
              submittedToRegulator: 'ea',
              siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
            },
            tonnage: 200
          })
        )
        await repository.create(
          buildDraftPrn({
            accreditation: {
              id: 'acc-different',
              accreditationNumber: 'ACC-3',
              accreditationYear: 2026,
              material: 'plastic',
              submittedToRegulator: 'ea',
              siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
            },
            tonnage: 300
          })
        )

        const result = await repository.findByAccreditation(accreditationId)

        expect(result).toHaveLength(2)
        const tonnages = result.map((prn) => prn.tonnage).sort((a, b) => a - b)
        expect(tonnages).toEqual([100, 200])
      })

      it('returns PRNs with their ids populated', async () => {
        const accreditationId = `acc-ids-${Date.now()}`

        await repository.create(
          buildDraftPrn({
            accreditation: {
              id: accreditationId,
              accreditationNumber: 'ACC-IDS',
              accreditationYear: 2026,
              material: 'plastic',
              submittedToRegulator: 'ea',
              siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
            }
          })
        )

        const result = await repository.findByAccreditation(accreditationId)

        expect(result).toHaveLength(1)
        expect(result[0].id).toBeDefined()
        expect(typeof result[0].id).toBe('string')
      })

      it('does not return PRNs from different accreditations', async () => {
        const accreditationA = `acc-A-${Date.now()}`
        const accreditationB = `acc-B-${Date.now()}`

        await repository.create(
          buildDraftPrn({
            accreditation: {
              id: accreditationA,
              accreditationNumber: 'ACC-A',
              accreditationYear: 2026,
              material: 'plastic',
              submittedToRegulator: 'ea',
              siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
            },
            organisation: { id: 'org-A', name: 'Org A' }
          })
        )
        await repository.create(
          buildDraftPrn({
            accreditation: {
              id: accreditationB,
              accreditationNumber: 'ACC-B',
              accreditationYear: 2026,
              material: 'plastic',
              submittedToRegulator: 'ea',
              siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
            },
            organisation: { id: 'org-B', name: 'Org B' }
          })
        )

        const result = await repository.findByAccreditation(accreditationA)

        expect(result).toHaveLength(1)
        expect(result[0].organisation.id).toBe('org-A')
      })

      it('does not return deleted PRNs (soft delete)', async () => {
        const accreditationId = `acc-deleted-${Date.now()}`
        const accreditation = {
          id: accreditationId,
          accreditationNumber: 'ACC-DEL',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea',
          siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
        }

        await repository.create(
          buildDraftPrn({
            accreditation,
            tonnage: 100
          })
        )
        await repository.create(
          buildDeletedPrn({
            accreditation,
            tonnage: 200
          })
        )

        const result = await repository.findByAccreditation(accreditationId)

        expect(result).toHaveLength(1)
        expect(result[0].tonnage).toBe(100)
      })
    })
  })
}
