import {
  SEED_ACCREDITATION_YEAR,
  nextSeedAccreditationNumber,
  nextSeedOrganisationNumber,
  nextSeedRegistrationNumber,
  seedNamed
} from './organisation-seed-test-helpers.js'
import { toYear } from '#common/helpers/dates/year.js'
import { findOrganisation } from './organisation-read-test-helpers.js'

/** @import { OrganisationReadRepositoryContractIt, OrganisationSeed } from '../port.contract.js' */
/** @import { OrganisationReadRepository } from '../port.js' */
/** @import { ExporterRegistration } from '#organisation-read-model/domain/model.js' */

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

  describe('findByOrganisationNumber for a year', () => {
    // Statuses for a year are judged as of the earlier of its end and today,
    // so today is fixed after every year these tests ask for has started.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /**
     * @param {OrganisationReadRepository} repository
     * @param {OrganisationSeed} seed
     * @param {number} year
     */
    const findInYear = (repository, seed, year) =>
      findOrganisation(repository, seed.organisationNumber, {
        year: toYear(year)
      })

    const accredited = () => {
      const registrationNumber = nextSeedRegistrationNumber()
      return {
        registrationNumber,
        seed: seedNamed('Beta Recycling', {
          registrations: [
            {
              registrationNumber,
              accreditationNumber: nextSeedAccreditationNumber()
            }
          ]
        })
      }
    }

    it("serves a registration approved in the year with that year's accreditation", async ({
      organisationReadRepositoryServing
    }) => {
      const { registrationNumber, seed } = accredited()
      const repository = await organisationReadRepositoryServing([seed])

      const organisation = await findInYear(
        repository,
        seed,
        SEED_ACCREDITATION_YEAR
      )

      expect(
        Object.keys(
          organisation.registrations[registrationNumber].accreditations
        )
      ).toEqual([String(SEED_ACCREDITATION_YEAR)])
    })

    it('serves a registration still approved in a later year, without an accreditation it does not hold for that year', async ({
      organisationReadRepositoryServing
    }) => {
      const { registrationNumber, seed } = accredited()
      const repository = await organisationReadRepositoryServing([seed])

      const organisation = await findInYear(
        repository,
        seed,
        SEED_ACCREDITATION_YEAR + 1
      )

      expect(
        organisation.registrations[registrationNumber].accreditations
      ).toEqual({})
    })

    it('serves no registration approved after the year', async ({
      organisationReadRepositoryServing
    }) => {
      const { seed } = accredited()
      const repository = await organisationReadRepositoryServing([seed])

      const organisation = await findInYear(
        repository,
        seed,
        SEED_ACCREDITATION_YEAR - 1
      )

      expect(organisation.registrations).toEqual({})
    })
  })

  describe('findByOrganisationNumber for an exporter with overseas sites', () => {
    it("serves each overseas site by its number, and its accreditation's view of whether each is approved", async ({
      organisationReadRepositoryServing
    }) => {
      const registrationNumber = nextSeedRegistrationNumber()
      const seed = seedNamed('Beta Exports', {
        registrations: [
          {
            registrationNumber,
            accreditationNumber: nextSeedAccreditationNumber(),
            wasteProcessingType: 'exporter',
            overseasSites: [
              {
                siteNumber: '001',
                name: 'Berlin Reprocessor',
                approvedOn: `${SEED_ACCREDITATION_YEAR}-03-01`
              },
              { siteNumber: '002', name: 'Hamburg Reprocessor' }
            ]
          }
        ]
      })
      const repository = await organisationReadRepositoryServing([seed])

      const organisation = await findOrganisation(
        repository,
        seed.organisationNumber
      )

      const registration = /** @type {ExporterRegistration} */ (
        organisation.registrations[registrationNumber]
      )
      expect(
        Object.fromEntries(
          Object.entries(registration.overseasSites).map(
            ([siteNumber, { name }]) => [siteNumber, name]
          )
        )
      ).toEqual({ '001': 'Berlin Reprocessor', '002': 'Hamburg Reprocessor' })
      expect(registration.overseasSites['001']).toHaveProperty(
        'validFrom',
        `${SEED_ACCREDITATION_YEAR}-03-01T00:00:00.000Z`
      )
      expect(registration.overseasSites['002']).not.toHaveProperty('validFrom')
      expect(
        registration.accreditations[SEED_ACCREDITATION_YEAR].overseasSites
      ).toEqual({
        '001': {
          status: 'approved',
          approvedOn: `${SEED_ACCREDITATION_YEAR}-03-01`
        },
        '002': { status: 'pending' }
      })
    })
  })
}
