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
