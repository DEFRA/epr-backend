import { describe, expect, it as baseIt } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { createInMemoryOrganisationReadRepository } from './inmemory.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'
import {
  approvedTimelineFrom,
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from './read-model-test-data.js'
import { SEED_ACCREDITATION_YEAR } from './contract/organisation-seed-test-helpers.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryServing, OrganisationSeed } from './port.contract.js' */

/** @param {Organisation[]} organisations */
const repositoryOf = (organisations) =>
  createInMemoryOrganisationReadRepository(organisations)()

/**
 * The seeded organisation in the read model's shape: each registration
 * approved, with an accreditation approved from 1 July of
 * `SEED_ACCREDITATION_YEAR` when the seed gives an accreditation number.
 *
 * @param {OrganisationSeed} seed
 * @returns {Organisation}
 */
const toReadModel = ({ name, organisationNumber, registrations }) =>
  buildReadOrganisation({
    name,
    organisationNumber,
    registrations: Object.fromEntries(
      registrations.map(({ registrationNumber, accreditationNumber }) => [
        registrationNumber,
        buildReadReprocessorRegistration({
          accreditations: accreditationNumber
            ? {
                [SEED_ACCREDITATION_YEAR]: buildReadAccreditation({
                  accreditationNumber,
                  status: {
                    current: 'approved',
                    timeline: approvedTimelineFrom(
                      `${SEED_ACCREDITATION_YEAR}-07-01`
                    )
                  }
                })
              }
            : {}
        })
      ])
    )
  })

const it = baseIt.extend(
  /** @type {{ organisationReadRepositoryServing: (context: any, use: (value: OrganisationReadRepositoryServing) => Promise<void>) => Promise<void> }} */ ({
    // eslint-disable-next-line no-empty-pattern
    organisationReadRepositoryServing: async ({}, use) => {
      await use(async (seeds) => repositoryOf(seeds.map(toReadModel)))
    }
  })
)

describe('in-memory organisation read repository', () => {
  testOrganisationReadRepositoryContract(
    /** @type {OrganisationReadRepositoryContractIt} */ (
      /** @type {unknown} */ (it)
    )
  )

  describe('serves the organisations exactly as it holds them', () => {
    const held = () =>
      buildReadOrganisation({
        registrations: {
          R26ER5001180041PL: buildReadReprocessorRegistration({
            accreditations: { 2026: buildReadAccreditation() }
          })
        }
      })

    it('from findByOrganisationNumber', async () => {
      const organisation = held()
      const repository = repositoryOf([buildReadOrganisation(), organisation])

      expect(
        await repository.findByOrganisationNumber(
          organisation.organisationNumber
        )
      ).toStrictEqual(organisation)
    })

    it('from findByOrganisationNumber for a year, as they are already as they stood in that year', async () => {
      const organisation = held()
      const repository = repositoryOf([organisation])

      expect(
        await repository.findByOrganisationNumber(
          organisation.organisationNumber,
          { year: toYear(2027) }
        )
      ).toStrictEqual(organisation)
    })

    it('from find', async () => {
      const organisation = held()
      const repository = repositoryOf([buildReadOrganisation(), organisation])

      const { items } = await repository.find({
        organisationNumber: organisation.organisationNumber,
        page: 1,
        pageSize: 10
      })

      expect(items).toStrictEqual([organisation])
    })

    it('from findAll', async () => {
      const organisations = [held(), buildReadOrganisation()]
      const repository = repositoryOf(organisations)

      expect(await repository.findAll()).toStrictEqual(organisations)
    })
  })

  describe('copies', () => {
    it('returns a copy, so changing it changes nothing held', async () => {
      const held = buildReadOrganisation()
      const repository = repositoryOf([held])

      const first = /** @type {Organisation} */ (
        await repository.findByOrganisationNumber(held.organisationNumber)
      )
      first.name = 'Changed'

      expect(
        await repository.findByOrganisationNumber(held.organisationNumber)
      ).toHaveProperty('name', 'ACME ltd')
    })

    it('is not changed by changes to the organisations it was given', async () => {
      const held = buildReadOrganisation()
      const repository = repositoryOf([held])

      held.name = 'Changed'

      expect(
        await repository.findByOrganisationNumber(held.organisationNumber)
      ).toHaveProperty('name', 'ACME ltd')
    })
  })
})
