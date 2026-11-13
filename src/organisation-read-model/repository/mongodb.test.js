import { ObjectId } from 'mongodb'

import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it as organisationReadIt } from '#vite/fixtures/organisation-read-mongo.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  exporter,
  exporterAccreditation,
  findOrganisation,
  reprocessor
} from './contract/organisation-read-test-helpers.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'
import { SEED_ACCREDITATION_YEAR } from './contract/organisation-seed-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryServing, OrganisationSeed, OverseasSiteSeed } from './port.contract.js' */

/**
 * The overseas-site record a seeded site is stored as: approved from its
 * `approvedOn`, or pending without one.
 *
 * @param {OverseasSiteSeed} site
 */
const toStoredSite = ({ name, approvedOn }) => ({
  id: new ObjectId().toString(),
  name,
  country: 'Germany',
  address: { line1: '1 Teststrasse', townOrCity: 'Berlin' },
  ...(approvedOn && { validFrom: new Date(approvedOn) }),
  createdAt: new Date(),
  updatedAt: new Date()
})

/**
 * The seeded organisation as the organisations collection stores it, and the
 * overseas-site records its exporters use. Each registration is approved,
 * numbered and of the kind it names, and linked to an accreditation approved
 * from 1 July of `SEED_ACCREDITATION_YEAR` when the seed gives an
 * accreditation number.
 *
 * @param {OrganisationSeed} seed
 */
const toStored = ({ name, organisationNumber, registrations }) => {
  const linked = registrations.map(
    ({
      registrationNumber,
      accreditationNumber,
      wasteProcessingType,
      overseasSites = []
    }) => {
      const exporting = wasteProcessingType === 'exporter'
      const sites = overseasSites.map((site) => ({
        siteNumber: site.siteNumber,
        record: toStoredSite(site)
      }))
      const held = accreditationNumber
        ? (exporting ? exporterAccreditation : accreditation)({
            accreditationNumber,
            validFrom: `${SEED_ACCREDITATION_YEAR}-07-01`,
            validTo: `${SEED_ACCREDITATION_YEAR}-12-31`
          })
        : undefined
      return {
        registration: exporting
          ? exporter({
              registrationNumber,
              accreditationId: held?.id,
              overseasSites: Object.fromEntries(
                sites.map(({ siteNumber, record }) => [
                  siteNumber,
                  { overseasSiteId: record.id }
                ])
              )
            })
          : reprocessor({ registrationNumber, accreditationId: held?.id }),
        accreditation: held,
        siteRecords: sites.map(({ record }) => record)
      }
    }
  )
  return {
    organisation: buildOrganisation({
      organisationNumber,
      companyDetails: { name },
      registrations: linked.map(({ registration }) => registration),
      accreditations: linked.flatMap(({ accreditation: held }) =>
        held ? [held] : []
      )
    }),
    siteRecords: linked.flatMap(({ siteRecords }) => siteRecords)
  }
}

const it = organisationReadIt.extend(
  /** @type {{ organisationReadRepositoryServing: (context: any, use: (value: OrganisationReadRepositoryServing) => Promise<void>) => Promise<void> }} */ ({
    organisationReadRepositoryServing: async (
      { organisationReadRepositoryWith },
      use
    ) => {
      await use((seeds) => {
        const stored = seeds.map(toStored)
        return organisationReadRepositoryWith({
          organisations: stored.map(({ organisation }) => organisation),
          overseasSites: stored.flatMap(({ siteRecords }) => siteRecords)
        })
      })
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
