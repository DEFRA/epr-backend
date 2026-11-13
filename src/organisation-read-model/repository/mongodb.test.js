import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it as organisationReadIt } from '#vite/fixtures/organisation-read-mongo.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  findOrganisation,
  reprocessor
} from './contract/organisation-read-test-helpers.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'
import { SEED_ACCREDITATION_YEAR } from './contract/organisation-seed-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryServing, OrganisationSeed } from './port.contract.js' */

/**
 * The seeded organisation as the organisations collection stores it: each
 * registration approved and numbered, and linked to an accreditation approved
 * from 1 July of `SEED_ACCREDITATION_YEAR` when the seed gives an
 * accreditation number.
 *
 * @param {OrganisationSeed} seed
 */
const toStored = ({ name, organisationNumber, registrations }) => {
  const linked = registrations.map(
    ({ registrationNumber, accreditationNumber }) => {
      const held = accreditationNumber
        ? accreditation({
            accreditationNumber,
            validFrom: `${SEED_ACCREDITATION_YEAR}-07-01`,
            validTo: `${SEED_ACCREDITATION_YEAR}-12-31`
          })
        : undefined
      return {
        registration: reprocessor({
          registrationNumber,
          accreditationId: held?.id
        }),
        accreditation: held
      }
    }
  )
  return buildOrganisation({
    organisationNumber,
    companyDetails: { name },
    registrations: linked.map(({ registration }) => registration),
    accreditations: linked.flatMap(({ accreditation: held }) =>
      held ? [held] : []
    )
  })
}

const it = organisationReadIt.extend(
  /** @type {{ organisationReadRepositoryServing: (context: any, use: (value: OrganisationReadRepositoryServing) => Promise<void>) => Promise<void> }} */ ({
    organisationReadRepositoryServing: async (
      { organisationReadRepositoryWith },
      use
    ) => {
      await use((seeds) =>
        organisationReadRepositoryWith({ organisations: seeds.map(toStored) })
      )
    }
  })
)

describe('organisation read repository over MongoDB repositories', () => {
  testOrganisationReadRepositoryContract(
    /** @type {OrganisationReadRepositoryContractIt} */ (
      /** @type {unknown} */ (it)
    )
  )

  it('dates the status timeline from status changes stored as BSON dates', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = buildOrganisation({
      registrations: [
        reprocessor({
          statusHistory: [
            { status: 'created', updatedAt: new Date('2026-01-01T09:00:00Z') },
            { status: 'approved', updatedAt: new Date('2026-02-01T23:30:00Z') }
          ]
        })
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(organisation.registrations[REPROCESSOR_NUMBER]).toHaveProperty(
      'status.timeline',
      [
        {
          status: 'created',
          at: '2026-01-01T09:00:00.000Z',
          updatedAt: '2026-01-01T09:00:00.000Z'
        },
        {
          status: 'approved',
          at: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T23:30:00.000Z'
        }
      ]
    )
  })
})
