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
import {
  SEED_ACCREDITATION_YEAR,
  SEED_REGISTRATION_APPROVED_ON
} from './contract/organisation-seed-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { OrganisationReadRepositoryServingFixture, OrganisationSeed, OverseasSiteSeed } from './port.contract.js' */
/** @typedef {OrganisationSeed['registrations'][number]} SeededRegistration */

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
 * The accreditation a seed's accreditation number gives, as stored: valid for
 * `SEED_ACCREDITATION_YEAR` from 1 July, and approved.
 *
 * @param {NonNullable<SeededRegistration['accreditationNumber']>} accreditationNumber
 * @param {boolean} exporting
 */
const toStoredAccreditation = (accreditationNumber, exporting) =>
  (exporting ? exporterAccreditation : accreditation)({
    accreditationNumber,
    validFrom: `${SEED_ACCREDITATION_YEAR}-07-01`,
    validTo: `${SEED_ACCREDITATION_YEAR}-12-31`
  })

/**
 * A seeded registration as stored, with its accreditation and the
 * overseas-site records it uses: approved from its `approvedOn`, numbered,
 * and of the kind it names.
 *
 * @param {SeededRegistration} registration
 */
const toStoredRegistration = ({
  registrationNumber,
  accreditationNumber,
  wasteProcessingType,
  overseasSites = [],
  approvedOn = SEED_REGISTRATION_APPROVED_ON
}) => {
  const exporting = wasteProcessingType === 'exporter'
  const sites = overseasSites.map((site) => ({
    siteNumber: site.siteNumber,
    record: toStoredSite(site)
  }))
  const storedAccreditation = accreditationNumber
    ? toStoredAccreditation(accreditationNumber, exporting)
    : undefined
  const approved = {
    registrationNumber,
    accreditationId: storedAccreditation?.id,
    validFrom: approvedOn,
    statusHistory: [
      { status: 'created', updatedAt: `${approvedOn}T00:00:00.000Z` },
      { status: 'approved', updatedAt: `${approvedOn}T00:00:00.000Z` }
    ]
  }
  return {
    registration: exporting
      ? exporter({
          ...approved,
          overseasSites: Object.fromEntries(
            sites.map(({ siteNumber, record }) => [
              siteNumber,
              { overseasSiteId: record.id }
            ])
          )
        })
      : reprocessor(approved),
    storedAccreditation,
    siteRecords: sites.map(({ record }) => record)
  }
}

/**
 * The seeded organisation as the organisations collection stores it, and the
 * overseas-site records its exporters use, each registration built by
 * `toStoredRegistration`.
 *
 * @param {OrganisationSeed} seed
 */
const toStored = ({ name, organisationNumber, registrations }) => {
  const stored = registrations.map(toStoredRegistration)
  return {
    organisation: buildOrganisation({
      organisationNumber,
      companyDetails: { name },
      registrations: stored.map(({ registration }) => registration),
      accreditations: stored.flatMap(({ storedAccreditation }) =>
        storedAccreditation ? [storedAccreditation] : []
      )
    }),
    siteRecords: stored.flatMap(({ siteRecords }) => siteRecords)
  }
}

const it = organisationReadIt.extend(
  /** @type {OrganisationReadRepositoryServingFixture} */ ({
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
  testOrganisationReadRepositoryContract(it)

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

    expect(organisation.registrations[REPROCESSOR_NUMBER].status).toMatchObject(
      {
        lastUpdatedAt: '2026-02-01T23:30:00.000Z',
        timeline: [{ status: 'approved', at: '2026-02-01T00:00:00.000Z' }]
      }
    )
  })
})
