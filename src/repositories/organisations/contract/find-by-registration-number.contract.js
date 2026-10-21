import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation, buildRegistration } from './test-data.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'

export const testFindByRegistrationNumberBehaviour = (it) => {
  describe('findByRegistrationNumber', () => {
    /** @type {import('../port.js').OrganisationsRepository} */
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

    it('returns null when no registration holds the number', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const result = await repository.findByRegistrationNumber(
        toRegistrationNumber('REG000000')
      )

      expect(result).toBeNull()
    })

    it('returns the organisation holding a registration with the number', async () => {
      const registration = buildRegistration({
        registrationNumber: 'REG777777'
      })
      const org = buildOrganisation({ registrations: [registration] })
      const otherOrg = buildOrganisation()
      await Promise.all([org, otherOrg].map((o) => repository.insert(o)))

      const result = await repository.findByRegistrationNumber(
        toRegistrationNumber('REG777777')
      )

      expect(result).toMatchObject({ id: org.id })
    })

    it('finds the number regardless of which registration on the organisation holds it', async () => {
      const first = buildRegistration()
      const second = buildRegistration({ registrationNumber: 'REG888888' })
      const org = buildOrganisation({ registrations: [first, second] })
      await repository.insert(org)

      const result = await repository.findByRegistrationNumber(
        toRegistrationNumber('REG888888')
      )

      expect(result).toMatchObject({ id: org.id })
    })
  })
}
