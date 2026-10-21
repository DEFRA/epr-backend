import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation, buildRegistration } from './test-data.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'

/** @import { OrganisationsRepository, OrganisationsRepositoryFactory } from '../port.js' */

export const testIsRegistrationNumberInUseBehaviour = (it) => {
  describe('isRegistrationNumberInUse', () => {
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

    it('is false when no registration holds the number', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const result = await repository.isRegistrationNumberInUse(
        toRegistrationNumber('REG000000')
      )

      expect(result).toBe(false)
    })

    it('is true when an organisation holds a registration with the number', async () => {
      const registration = buildRegistration({
        registrationNumber: 'REG777777'
      })
      const org = buildOrganisation({ registrations: [registration] })
      const otherOrg = buildOrganisation()
      await Promise.all([org, otherOrg].map((o) => repository.insert(o)))

      const result = await repository.isRegistrationNumberInUse(
        toRegistrationNumber('REG777777')
      )

      expect(result).toBe(true)
    })

    it('is true regardless of which registration on the organisation holds the number', async () => {
      const first = buildRegistration()
      const second = buildRegistration({ registrationNumber: 'REG888888' })
      const org = buildOrganisation({ registrations: [first, second] })
      await repository.insert(org)

      const result = await repository.isRegistrationNumberInUse(
        toRegistrationNumber('REG888888')
      )

      expect(result).toBe(true)
    })
  })
}
