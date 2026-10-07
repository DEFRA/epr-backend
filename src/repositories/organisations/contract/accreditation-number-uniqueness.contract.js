import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation, prepareOrgUpdate } from './test-data.js'

export const testAccreditationNumberUniquenessBehaviour = (it) => {
  describe('accreditation number uniqueness', () => {
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

    /** @param {Array<string | null>} accreditationNumbers - given to the organisation's accreditations in order; the rest stay unnumbered */
    const organisationWithNumbers = (...accreditationNumbers) => {
      const organisation = buildOrganisation()
      return {
        ...organisation,
        accreditations: organisation.accreditations.map(
          (accreditation, index) => ({
            ...accreditation,
            accreditationNumber: accreditationNumbers[index] ?? null
          })
        )
      }
    }

    it('accepts any number of unnumbered accreditations across organisations', async () => {
      const first = organisationWithNumbers()
      const second = organisationWithNumbers()

      await repository.insert(first)
      await repository.insert(second)

      const result = await repository.findById(second.id)
      expect(result.accreditations[0].accreditationNumber).toBeNull()
    })

    it('accepts organisations that each hold numbered and unnumbered accreditations', async () => {
      const first = organisationWithNumbers('ACC100006', null)
      const second = organisationWithNumbers('ACC100007', null)

      await repository.insert(first)
      await repository.insert(second)

      const result = await repository.findById(second.id)
      expect(result.accreditations[0].accreditationNumber).toBe('ACC100007')
      expect(result.accreditations[1].accreditationNumber).toBeNull()
    })

    it('refuses an organisation holding the same accreditation number twice', async () => {
      await expect(
        repository.insert(organisationWithNumbers('ACC100003', 'ACC100003'))
      ).rejects.toThrow(
        /Invalid organisation data: accreditations\.1: .*duplicate value/
      )
    })

    it('refuses to give a second accreditation in the organisation a number the first holds', async () => {
      const organisation = organisationWithNumbers('ACC100004', null)
      await repository.insert(organisation)
      const inserted = await repository.findById(organisation.id)

      await expect(
        repository.replace(
          organisation.id,
          1,
          prepareOrgUpdate(inserted, {
            accreditations: [
              {
                ...inserted.accreditations[1],
                accreditationNumber: 'ACC100004'
              }
            ]
          })
        )
      ).rejects.toThrow(
        /Invalid organisation data: accreditations\.1: .*duplicate value/
      )
    })

    it('lets an organisation be saved again with the numbers it already holds', async () => {
      const organisation = organisationWithNumbers('ACC100005', null)
      await repository.insert(organisation)
      const inserted = await repository.findById(organisation.id)

      await repository.replace(
        organisation.id,
        1,
        prepareOrgUpdate(inserted, { wasteProcessingTypes: ['reprocessor'] })
      )

      const result = await repository.findById(organisation.id, 2)
      expect(result.accreditations[0].accreditationNumber).toBe('ACC100005')
      expect(result.accreditations[1].accreditationNumber).toBeNull()
    })
  })
}
