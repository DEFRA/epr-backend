import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation, prepareOrgUpdate } from './test-data.js'

export const testRegistrationNumberUniquenessBehaviour = (it) => {
  describe('registration number uniqueness', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import('../port.js').OrganisationsRepositoryFactory }} */ {
          organisationsRepository
        }
      ) => {
        repository = await organisationsRepository()
      }
    )

    /** @param {Array<string | null>} registrationNumbers - given to the organisation's registrations in order; the rest stay unnumbered */
    const organisationWithNumbers = (...registrationNumbers) => {
      const organisation = buildOrganisation()
      return {
        ...organisation,
        registrations: organisation.registrations.map(
          (registration, index) => ({
            ...registration,
            registrationNumber: registrationNumbers[index] ?? null
          })
        )
      }
    }

    it('accepts any number of unnumbered registrations across organisations', async () => {
      const first = organisationWithNumbers()
      const second = organisationWithNumbers()

      await repository.insert(first)
      await repository.insert(second)

      const result = await repository.findById(second.id)
      expect(result.registrations[0].registrationNumber).toBeNull()
    })

    it('accepts organisations that each hold numbered and unnumbered registrations', async () => {
      const first = organisationWithNumbers('REG100006', null)
      const second = organisationWithNumbers('REG100007', null)

      await repository.insert(first)
      await repository.insert(second)

      const result = await repository.findById(second.id)
      expect(result.registrations[0].registrationNumber).toBe('REG100007')
      expect(result.registrations[1].registrationNumber).toBeNull()
    })

    it('refuses an organisation holding the same registration number twice', async () => {
      await expect(
        repository.insert(organisationWithNumbers('REG100003', 'REG100003'))
      ).rejects.toThrow(
        /Invalid organisation data: registrations\.1: .*duplicate value/
      )
    })

    it('refuses to give a second registration in the organisation a number the first holds', async () => {
      const organisation = organisationWithNumbers('REG100004', null)
      await repository.insert(organisation)
      const inserted = await repository.findById(organisation.id)

      await expect(
        repository.replace(
          organisation.id,
          1,
          prepareOrgUpdate(inserted, {
            registrations: [
              {
                ...inserted.registrations[1],
                registrationNumber: 'REG100004'
              }
            ]
          })
        )
      ).rejects.toThrow(
        /Invalid organisation data: registrations\.1: .*duplicate value/
      )
    })

    it('lets an organisation be saved again with the numbers it already holds', async () => {
      const organisation = organisationWithNumbers('REG100005', null)
      await repository.insert(organisation)
      const inserted = await repository.findById(organisation.id)

      await repository.replace(
        organisation.id,
        1,
        prepareOrgUpdate(inserted, { wasteProcessingTypes: ['reprocessor'] })
      )

      const result = await repository.findById(organisation.id, 2)
      expect(result.registrations[0].registrationNumber).toBe('REG100005')
      expect(result.registrations[1].registrationNumber).toBeNull()
    })
  })
}
