import { beforeEach, describe, expect } from 'vitest'
import { buildAccreditation, buildOrganisation } from './test-data.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'

/** @import { OrganisationsRepository, OrganisationsRepositoryFactory } from '../port.js' */

export const testIsAccreditationNumberInUseBehaviour = (it) => {
  describe('isAccreditationNumberInUse', () => {
    /** @type {OrganisationsRepository} */
    let repository

    beforeEach(
      async (
        /** @type {{ organisationsRepository: OrganisationsRepositoryFactory }} */ {
          organisationsRepository
        }
      ) => {
        repository = await organisationsRepository()
      }
    )

    it('is false when no accreditation holds the number', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const result = await repository.isAccreditationNumberInUse(
        toAccreditationNumber('ACC000000')
      )

      expect(result).toBe(false)
    })

    it('is true when an organisation holds an accreditation with the number', async () => {
      const accreditation = buildAccreditation({
        accreditationNumber: toAccreditationNumber('ACC777777')
      })
      const org = buildOrganisation({ accreditations: [accreditation] })
      const otherOrg = buildOrganisation()
      await Promise.all([org, otherOrg].map((o) => repository.insert(o)))

      const result = await repository.isAccreditationNumberInUse(
        toAccreditationNumber('ACC777777')
      )

      expect(result).toBe(true)
    })

    it('is true regardless of which accreditation on the organisation holds the number', async () => {
      const first = buildAccreditation()
      const second = buildAccreditation({
        accreditationNumber: toAccreditationNumber('ACC888888')
      })
      const org = buildOrganisation({ accreditations: [first, second] })
      await repository.insert(org)

      const result = await repository.isAccreditationNumberInUse(
        toAccreditationNumber('ACC888888')
      )

      expect(result).toBe(true)
    })
  })
}
