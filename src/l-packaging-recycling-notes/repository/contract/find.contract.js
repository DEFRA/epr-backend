import { describe, beforeEach, expect } from 'vitest'
import { buildDraftPrn, buildDeletedPrn } from './test-data.js'

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
          issuedByOrganisation: 'org-find-test',
          tonnage: 123.45
        })

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found).toBeTruthy()
        expect(found.id).toBe(created.id)
        expect(found.issuedByOrganisation).toBe('org-find-test')
        expect(found.tonnage).toBe(123.45)
      })

      it('does not return PRNs with different ids', async () => {
        const prn1 = await repository.create(
          buildDraftPrn({ issuedByOrganisation: 'org-A' })
        )
        await repository.create(
          buildDraftPrn({ issuedByOrganisation: 'org-B' })
        )

        const found = await repository.findById(prn1.id)

        expect(found.issuedByOrganisation).toBe('org-A')
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
            issuedByAccreditation: accreditationId,
            tonnage: 100
          })
        )
        await repository.create(
          buildDraftPrn({
            issuedByAccreditation: accreditationId,
            tonnage: 200
          })
        )
        await repository.create(
          buildDraftPrn({
            issuedByAccreditation: 'acc-different',
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
          buildDraftPrn({ issuedByAccreditation: accreditationId })
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
            issuedByAccreditation: accreditationA,
            issuedByOrganisation: 'org-A'
          })
        )
        await repository.create(
          buildDraftPrn({
            issuedByAccreditation: accreditationB,
            issuedByOrganisation: 'org-B'
          })
        )

        const result = await repository.findByAccreditation(accreditationA)

        expect(result).toHaveLength(1)
        expect(result[0].issuedByOrganisation).toBe('org-A')
      })

      it('does not return deleted PRNs (soft delete)', async () => {
        const accreditationId = `acc-deleted-${Date.now()}`

        await repository.create(
          buildDraftPrn({
            issuedByAccreditation: accreditationId,
            tonnage: 100
          })
        )
        await repository.create(
          buildDeletedPrn({
            issuedByAccreditation: accreditationId,
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
