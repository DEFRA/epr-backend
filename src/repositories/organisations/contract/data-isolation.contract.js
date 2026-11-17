import { describe, beforeEach, expect } from 'vitest'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'

/** @import { OrganisationBuilders } from './test-data.js' */

export const testDataIsolationBehaviour = (it) => {
  describe('data isolation', () => {
    let repository
    /** @type {OrganisationBuilders['buildOrganisation']} */
    let buildOrganisation

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import("../port.js").OrganisationsRepositoryFactory, organisationBuilders: OrganisationBuilders }} */ {
          organisationsRepository,
          organisationBuilders
        }
      ) => {
        repository = await organisationsRepository()
        buildOrganisation = organisationBuilders.buildOrganisation
      }
    )

    describe('findAll isolation', () => {
      it('returns independent copies that cannot modify stored data', async () => {
        const org1 = buildOrganisation()
        const org2 = buildOrganisation()
        await repository.insert(org1)
        await repository.insert(org2)

        const firstRead = await repository.findAll()
        const originalNumber = firstRead[0].organisationNumber

        // mutate returned array and objects
        firstRead[0].organisationNumber = toOrganisationNumber('999999')
        firstRead.push(buildOrganisation())

        const secondRead = await repository.findAll()
        expect(secondRead).toHaveLength(2)
        expect(secondRead[0].organisationNumber).toBe(originalNumber)
      })
    })

    describe('findById isolation', () => {
      it('returns a clone, not internal reference', async () => {
        const org = buildOrganisation()
        await repository.insert(org)

        const result = await repository.findById(org.id)
        const originalNumber = result.organisationNumber
        result.organisationNumber = toOrganisationNumber('999999')

        const again = await repository.findById(org.id)
        expect(again.organisationNumber).toBe(originalNumber)
      })
    })

    describe('insert isolation', () => {
      it('stores independent copies so input mutations do not affect storage', async () => {
        const org = buildOrganisation()
        const originalNumber = org.organisationNumber

        await repository.insert(org)

        // mutate input after insert
        org.organisationNumber = toOrganisationNumber('999999')

        const result = await repository.findById(org.id)
        expect(result.organisationNumber).toBe(originalNumber)
      })
    })
  })
}
