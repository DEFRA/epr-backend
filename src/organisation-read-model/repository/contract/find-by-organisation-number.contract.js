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

    it.for(/** @type {const} */ (['reprocessor', 'exporter']))(
      'returns the organisation with that number, its %s registration keyed by number with its accreditation',
      async (wasteProcessingType, { organisationReadRepositoryServing }) => {
        const registrationNumber = nextSeedRegistrationNumber()
        const accreditationNumber = nextSeedAccreditationNumber()
        const wanted = seedNamed('Beta Recycling', {
          registrations: [
            { registrationNumber, accreditationNumber, wasteProcessingType }
          ]
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
        const registration = organisation.registrations[registrationNumber]
        expect(registration.wasteProcessingType).toBe(wasteProcessingType)
        expect(registration.accreditations).toEqual({
          [SEED_ACCREDITATION_YEAR]: expect.objectContaining({
            accreditationNumber
          })
        })
      }
    )

    it("gives an exporter's registration and accreditation their overseas sites, and a reprocessor's registration its site", async ({
      organisationReadRepositoryServing
    }) => {
      const exporterNumber = nextSeedRegistrationNumber()
      const reprocessorNumber = nextSeedRegistrationNumber()
      const wanted = seedNamed('Beta Recycling', {
        registrations: [
          {
            registrationNumber: exporterNumber,
            accreditationNumber: nextSeedAccreditationNumber(),
            wasteProcessingType: 'exporter'
          },
          { registrationNumber: reprocessorNumber }
        ]
      })
      const repository = await organisationReadRepositoryServing([wanted])

      const { registrations } = await findOrganisation(
        repository,
        wanted.organisationNumber
      )

      expect(registrations[exporterNumber]).toHaveProperty('overseasSites', {})
      expect(registrations[exporterNumber]).not.toHaveProperty('site')
      expect(
        registrations[exporterNumber].accreditations[SEED_ACCREDITATION_YEAR]
      ).toHaveProperty('overseasSites', {})
      expect(registrations[reprocessorNumber]).toHaveProperty('site')
      expect(registrations[reprocessorNumber]).not.toHaveProperty(
        'overseasSites'
      )
    })
  })
}
