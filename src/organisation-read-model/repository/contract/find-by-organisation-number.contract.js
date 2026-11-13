import {
  SEED_ACCREDITATION_YEAR,
  nextSeedAccreditationNumber,
  nextSeedOrganisationNumber,
  nextSeedRegistrationNumber,
  seedNamed
} from './organisation-seed-test-helpers.js'
import { findOrganisation } from './organisation-read-test-helpers.js'

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testFindByOrganisationNumberBehaviour = (it) => {
  describe('findByOrganisationNumber', () => {
    it('returns null for an unknown organisation number', async ({
      organisationReadRepositoryServing
    }) => {
      const repository = await organisationReadRepositoryServing([
        seedNamed('Acme Recycling')
      ])

      expect(
        await repository.findByOrganisationNumber(nextSeedOrganisationNumber())
      ).toBeNull()
    })

    it('returns the organisation with that number, its registrations keyed by number with their accreditations', async ({
      organisationReadRepositoryServing
    }) => {
      const registrationNumber = nextSeedRegistrationNumber()
      const accreditationNumber = nextSeedAccreditationNumber()
      const wanted = seedNamed('Beta Recycling', {
        registrations: [{ registrationNumber, accreditationNumber }]
      })
      const repository = await organisationReadRepositoryServing([
        seedNamed('Acme Recycling'),
        wanted
      ])

      const organisation = await findOrganisation(
        repository,
        wanted.organisationNumber
      )

      expect(organisation).toMatchObject({
        organisationNumber: wanted.organisationNumber,
        name: 'Beta Recycling'
      })
      expect(Object.keys(organisation.registrations)).toEqual([
        registrationNumber
      ])
      expect(
        organisation.registrations[registrationNumber].accreditations
      ).toEqual({
        [SEED_ACCREDITATION_YEAR]: expect.objectContaining({
          accreditationNumber
        })
      })
    })
  })
}
