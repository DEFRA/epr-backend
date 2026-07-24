import { beforeEach, describe, expect } from 'vitest'
import { buildAccreditation, buildOrganisation } from './test-data.js'

export const testFindByAccreditationNumberBehaviour = (it) => {
  describe('findByAccreditationNumber', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import("../port.js").OrganisationsRepositoryFactory }} */ {
          organisationsRepository
        }
      ) => {
        repository = await organisationsRepository()
      }
    )

    it('returns null when no accreditation holds the number', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const result = await repository.findByAccreditationNumber('ACC000000')

      expect(result).toBeNull()
    })

    it('returns the organisation holding an accreditation with the number', async () => {
      const accreditation = buildAccreditation({
        accreditationNumber: 'ACC777777'
      })
      const org = buildOrganisation({ accreditations: [accreditation] })
      const otherOrg = buildOrganisation()
      await Promise.all([org, otherOrg].map((o) => repository.insert(o)))

      const result = await repository.findByAccreditationNumber('ACC777777')

      expect(result).toMatchObject({ id: org.id })
    })

    it('finds the number regardless of which accreditation on the organisation holds it', async () => {
      const first = buildAccreditation()
      const second = buildAccreditation({ accreditationNumber: 'ACC888888' })
      const org = buildOrganisation({ accreditations: [first, second] })
      await repository.insert(org)

      const result = await repository.findByAccreditationNumber('ACC888888')

      expect(result).toMatchObject({ id: org.id })
    })
  })
}
