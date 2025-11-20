import { describe, beforeEach, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'
import { STATUS } from '#domain/organisations/model.js'

export const testQueryBehaviour = (it) => {
  describe('query', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('returns empty array when no organisations exist', async () => {
      const result = await repository.query({})

      expect(result).toEqual([])
    })

    it('returns all organisations with empty filter', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()
      const org3 = buildOrganisation()

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.query({})

      expect(result).toHaveLength(3)
      expect(result.map((o) => o.id).sort()).toEqual(
        [org1.id, org2.id, org3.id].sort()
      )
    })

    it('filters by top-level string property', async () => {
      const org1 = buildOrganisation({ submittedToRegulator: 'ea' })
      const org2 = buildOrganisation({ submittedToRegulator: 'sepa' })
      const org3 = buildOrganisation({ submittedToRegulator: 'ea' })

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.query({ submittedToRegulator: 'ea' })

      expect(result).toHaveLength(2)
      expect(result.map((o) => o.id).sort()).toEqual([org1.id, org3.id].sort())
      expect(result.every((o) => o.submittedToRegulator === 'ea')).toBe(true)
    })

    it('filters by top-level number property', async () => {
      const org1 = buildOrganisation({ orgId: 50001 })
      const org2 = buildOrganisation({ orgId: 50002 })
      const org3 = buildOrganisation({ orgId: 50001 })

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.query({ orgId: 50001 })

      expect(result).toHaveLength(2)
      expect(result.map((o) => o.id).sort()).toEqual([org1.id, org3.id].sort())
      expect(result.every((o) => o.orgId === 50001)).toBe(true)
    })

    it('filters by nested property using dot notation', async () => {
      const org1 = buildOrganisation({
        companyDetails: {
          name: 'ACME Ltd',
          tradingName: 'ACME Trading',
          registrationNumber: 'AC123456',
          registeredAddress: {
            line1: '123 Main St',
            town: 'London',
            postcode: 'SW1A 1AA'
          }
        }
      })

      const org2 = buildOrganisation({
        companyDetails: {
          name: 'TechCorp Inc',
          tradingName: 'TechCorp',
          registrationNumber: 'TC789012',
          registeredAddress: {
            line1: '456 Tech Ave',
            town: 'Manchester',
            postcode: 'M1 1AA'
          }
        }
      })

      const org3 = buildOrganisation({
        companyDetails: {
          name: 'ACME Ltd',
          tradingName: 'ACME Solutions',
          registrationNumber: 'AC999999',
          registeredAddress: {
            line1: '789 Oak Road',
            town: 'Birmingham',
            postcode: 'B1 1AA'
          }
        }
      })

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.query({
        'companyDetails.name': 'ACME Ltd'
      })

      expect(result).toHaveLength(2)
      expect(result.map((o) => o.id).sort()).toEqual([org1.id, org3.id].sort())
      expect(result.every((o) => o.companyDetails.name === 'ACME Ltd')).toBe(
        true
      )
    })

    it('filters by multiple criteria (AND logic)', async () => {
      const org1 = buildOrganisation({
        orgId: 50001,
        submittedToRegulator: 'ea'
      })
      const org2 = buildOrganisation({
        orgId: 50001,
        submittedToRegulator: 'sepa'
      })
      const org3 = buildOrganisation({
        orgId: 50002,
        submittedToRegulator: 'ea'
      })

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.query({
        orgId: 50001,
        submittedToRegulator: 'ea'
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(org1.id)
      expect(result[0].orgId).toBe(50001)
      expect(result[0].submittedToRegulator).toBe('ea')
    })

    it('returns empty array when no matches found', async () => {
      const org1 = buildOrganisation({ submittedToRegulator: 'ea' })
      const org2 = buildOrganisation({ submittedToRegulator: 'sepa' })

      await Promise.all([org1, org2].map((org) => repository.insert(org)))

      const result = await repository.query({ submittedToRegulator: 'niea' })

      expect(result).toEqual([])
    })

    it('enriches results with current status', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      const result = await repository.query({})

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe(STATUS.CREATED)
      expect(result[0].registrations[0].status).toBe(STATUS.CREATED)
      expect(result[0].accreditations[0].status).toBe(STATUS.CREATED)
    })

    it('returns cloned data to ensure data isolation', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      const result1 = await repository.query({})
      const result2 = await repository.query({})

      expect(result1).not.toBe(result2)
      expect(result1[0]).not.toBe(result2[0])

      // Mutating result1 should not affect result2
      result1[0].orgId = 99999

      expect(result2[0].orgId).toBe(orgData.orgId)
    })

    it('filters correctly after updates', async () => {
      const orgData = buildOrganisation({ submittedToRegulator: 'ea' })
      await repository.insert(orgData)

      // Verify initial filter works
      let result = await repository.query({ submittedToRegulator: 'ea' })
      expect(result).toHaveLength(1)

      // Update the regulator
      await repository.update(orgData.id, 1, {
        submittedToRegulator: 'sepa'
      })

      // Allow time for eventual consistency to propagate
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Old filter should return nothing
      result = await repository.query({ submittedToRegulator: 'ea' })
      expect(result).toHaveLength(0)

      // New filter should find it
      result = await repository.query({ submittedToRegulator: 'sepa' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(orgData.id)
    })

    it('handles deeply nested property queries', async () => {
      const org1 = buildOrganisation({
        companyDetails: {
          name: 'Test Ltd',
          tradingName: 'Test',
          registrationNumber: '12345678',
          registeredAddress: {
            line1: '123 Main St',
            town: 'London',
            postcode: 'SW1A 1AA'
          }
        }
      })

      const org2 = buildOrganisation({
        companyDetails: {
          name: 'Other Ltd',
          tradingName: 'Other',
          registrationNumber: '87654321',
          registeredAddress: {
            line1: '456 Oak Ave',
            town: 'Manchester',
            postcode: 'M1 1AA'
          }
        }
      })

      await Promise.all([org1, org2].map((org) => repository.insert(org)))

      const result = await repository.query({
        'companyDetails.registeredAddress.town': 'London'
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(org1.id)
      expect(result[0].companyDetails.registeredAddress.town).toBe('London')
    })

    it('handles filter with null values correctly', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()

      await Promise.all([org1, org2].map((org) => repository.insert(org)))

      const result = await repository.query({
        orgId: org1.orgId,
        nonExistentField: null
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(org1.id)
    })

    it('handles filter with undefined values correctly', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()

      await Promise.all([org1, org2].map((org) => repository.insert(org)))

      const result = await repository.query({
        orgId: org1.orgId,
        nonExistentField: undefined
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(org1.id)
    })

    it('returns empty array when nested property does not exist', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const result = await repository.query({
        'nonExistent.nested.property': 'value'
      })

      expect(result).toEqual([])
    })

    it('handles partial nested path match correctly', async () => {
      const org = buildOrganisation({
        companyDetails: {
          name: 'Test Company',
          tradingName: 'Test',
          registrationNumber: '12345678',
          registeredAddress: {
            line1: '123 Street',
            town: 'TestTown',
            postcode: 'TT1 1TT'
          }
        }
      })
      await repository.insert(org)

      // Query for a property that exists but with wrong value
      const result = await repository.query({
        'companyDetails.registeredAddress.nonExistent': 'value'
      })

      expect(result).toEqual([])
    })
  })
}
