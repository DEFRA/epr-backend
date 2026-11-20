import {
  SEED_ACCREDITATION_YEAR,
  nextSeedAccreditationNumber,
  nextSeedRegistrationNumber,
  seedNamed
} from './organisation-seed-test-helpers.js'
import { toYear } from '#common/helpers/dates/year.js'

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

  describe('findAll for a year', () => {
    // Accreditations are served up to the latest open year, so today is fixed
    // in the latest year these tests ask for.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /**
     * @param {string} name
     * @param {string} approvedOn
     */
    const accredited = (name, approvedOn) => {
      const registrationNumber = nextSeedRegistrationNumber()
      return {
        registrationNumber,
        seed: seedNamed(name, {
          registrations: [
            {
              registrationNumber,
              accreditationNumber: nextSeedAccreditationNumber(),
              approvedOn
            }
          ]
        })
      }
    }

    it("serves every organisation, each with only the registrations approved in the year and that year's accreditations", async ({
      organisationReadRepositoryServing
    }) => {
      const inYear = accredited(
        'Acme Recycling',
        `${SEED_ACCREDITATION_YEAR}-02-01`
      )
      const afterYear = accredited(
        'Beta Recycling',
        `${SEED_ACCREDITATION_YEAR + 1}-02-01`
      )
      const repository = await organisationReadRepositoryServing([
        inYear.seed,
        afterYear.seed
      ])

      const organisations = await repository.findAll({
        year: SEED_ACCREDITATION_YEAR
      })

      const byName = Object.fromEntries(
        organisations.map((organisation) => [organisation.name, organisation])
      )
      expect(
        Object.keys(
          byName['Acme Recycling'].registrations[inYear.registrationNumber]
            .accreditations
        )
      ).toEqual([String(SEED_ACCREDITATION_YEAR)])
      expect(byName['Beta Recycling'].registrations).toEqual({})
    })

    it('serves a registration still approved in a later year, without an accreditation it does not hold for that year', async ({
      organisationReadRepositoryServing
    }) => {
      const { registrationNumber, seed } = accredited(
        'Acme Recycling',
        `${SEED_ACCREDITATION_YEAR}-02-01`
      )
      const repository = await organisationReadRepositoryServing([seed])

      const [organisation] = await repository.findAll({
        year: toYear(SEED_ACCREDITATION_YEAR + 1)
      })

      expect(
        organisation.registrations[registrationNumber].accreditations
      ).toEqual({})
    })
  })
}
