import { describe, beforeEach, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'

export const testFindAllIdsBehaviour = (it) => {
  describe('findAllIds', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('returns empty sets when no organisations exist', async () => {
      const result = await repository.findAllIds()

      expect(result).toEqual({
        organisations: new Set(),
        registrations: new Set(),
        accreditations: new Set()
      })
    })

    it('returns all organisation, registration and accreditation ids', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()
      const org3 = buildOrganisation()

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.findAllIds()

      expect(result).toEqual({
        organisations: new Set([org1.id, org2.id, org3.id]),
        registrations: new Set([
          ...org1.registrations.map((r) => r.id),
          ...org2.registrations.map((r) => r.id),
          ...org3.registrations.map((r) => r.id)
        ]),
        accreditations: new Set([
          ...org1.accreditations.map((a) => a.id),
          ...org2.accreditations.map((a) => a.id),
          ...org3.accreditations.map((a) => a.id)
        ])
      })
    })

    it('handles organisations with undefined registrations and accreditations', async () => {
      const org = buildOrganisation({
        registrations: undefined,
        accreditations: undefined
      })

      await repository.insert(org)

      const result = await repository.findAllIds()

      expect(result).toEqual({
        organisations: new Set([org.id]),
        registrations: new Set(),
        accreditations: new Set()
      })
    })
  })
}
