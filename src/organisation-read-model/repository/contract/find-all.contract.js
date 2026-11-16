import { seedNamed } from './organisation-seed-test-helpers.js'

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testFindAllBehaviour = (it) => {
  describe('findAll', () => {
    it('returns every organisation it serves', async ({
      organisationReadRepositoryServing
    }) => {
      const repository = await organisationReadRepositoryServing([
        seedNamed('Zeta Recycling'),
        seedNamed('Acme Recycling'),
        seedNamed('Beta Recycling')
      ])

      const organisations = await repository.findAll()

      expect(organisations.map(({ name }) => name).toSorted()).toStrictEqual([
        'Acme Recycling',
        'Beta Recycling',
        'Zeta Recycling'
      ])
    })
  })
}
