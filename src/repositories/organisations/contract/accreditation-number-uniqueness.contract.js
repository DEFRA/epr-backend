import { beforeEach, describe, expect } from 'vitest'
import { prepareOrgUpdate } from './test-data.js'

/** @import { OrganisationBuilders } from './test-data.js' */

export const testAccreditationNumberUniquenessBehaviour = (it) => {
  describe('accreditation number uniqueness', () => {
    let repository
    /** @type {OrganisationBuilders['buildOrganisation']} */
    let buildOrganisation

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import('../port.js').OrganisationsRepositoryFactory, organisationBuilders: OrganisationBuilders }} */ {
          organisationsRepository,
          organisationBuilders
        }
      ) => {
        repository = await organisationsRepository()
        buildOrganisation = organisationBuilders.buildOrganisation
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

    const refusalHeldElsewhere = {
      isBoom: true,
      output: {
        statusCode: 409,
        payload: {
          message: expect.stringContaining('accreditations.accreditationNumber')
        }
      }
    }

    it('refuses to insert an organisation whose accreditation number another organisation holds', async () => {
      await repository.insert(organisationWithNumbers('ACC100001'))

      await expect(
        repository.insert(organisationWithNumbers('ACC100001'))
      ).rejects.toMatchObject(refusalHeldElsewhere)
    })

    it('refuses to insert a number another organisation holds in another spelling', async () => {
      await repository.insert(organisationWithNumbers('ACC100008'))

      await expect(
        repository.insert(organisationWithNumbers(' acc100008 '))
      ).rejects.toMatchObject(refusalHeldElsewhere)
    })

    it('refuses to give an accreditation a number another organisation holds', async () => {
      await repository.insert(organisationWithNumbers('ACC100002'))
      const second = organisationWithNumbers()
      await repository.insert(second)
      const inserted = await repository.findById(second.id)

      await expect(
        repository.replace(
          second.id,
          1,
          prepareOrgUpdate(inserted, {
            accreditations: [
              {
                ...inserted.accreditations[0],
                accreditationNumber: ' acc100002 '
              }
            ]
          })
        )
      ).rejects.toMatchObject(refusalHeldElsewhere)
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

    it('accepts several unnumbered accreditations in one organisation', async () => {
      const organisation = organisationWithNumbers()
      await repository.insert(organisation)

      const result = await repository.findById(organisation.id)
      expect(
        result.accreditations.map(
          ({ accreditationNumber }) => accreditationNumber
        )
      ).toEqual(result.accreditations.map(() => null))
    })

    describe('canonical form', () => {
      it('stores an inserted number trimmed and upper-case', async () => {
        const organisation = organisationWithNumbers(' acc100020 ', null)
        await repository.insert(organisation)

        const result = await repository.findById(organisation.id)
        expect(result.accreditations[0].accreditationNumber).toBe('ACC100020')
      })

      it('stores a replaced number trimmed and upper-case', async () => {
        const organisation = organisationWithNumbers('ACC100021', null)
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        await repository.replace(
          organisation.id,
          1,
          prepareOrgUpdate(inserted, {
            accreditations: [
              {
                ...inserted.accreditations[0],
                accreditationNumber: ' acc100022'
              }
            ]
          })
        )

        const result = await repository.findById(organisation.id, 2)
        expect(result.accreditations[0].accreditationNumber).toBe('ACC100022')
      })

      it('refuses an insert whose numbers differ only in case or spacing', async () => {
        await expect(
          repository.insert(organisationWithNumbers('ACC100023', ' acc100023'))
        ).rejects.toThrow(
          /Invalid organisation data: accreditations\.1: .*duplicate value/
        )
      })

      it('refuses a replace whose numbers differ only in case or spacing', async () => {
        const organisation = organisationWithNumbers('ACC100024', null)
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
                  accreditationNumber: 'acc100024 '
                }
              ]
            })
          )
        ).rejects.toThrow(
          /Invalid organisation data: accreditations\.1: .*duplicate value/
        )
      })
    })
  })
}
