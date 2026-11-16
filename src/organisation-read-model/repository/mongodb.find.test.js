import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  approvedOverseasSite,
  exporter,
  overseasSites,
  pendingOverseasSite,
  reprocessor
} from './contract/organisation-read-test-helpers.js'
import { it } from '#vite/fixtures/organisation-read-mongo.js'

const { buildOrganisation, nextOrganisationNumber } =
  createOrganisationBuilders()

/**
 * Registration and accreditation numbers are unique across organisations.
 *
 * @param {string} name
 * @param {object} [overrides]
 */
const named = (name, overrides = {}) =>
  buildOrganisation({
    companyDetails: { name },
    registrations: [
      reprocessor({ registrationNumber: `R26ER${nextOrganisationNumber()}PL` })
    ],
    accreditations: [],
    ...overrides
  })

describe('find', () => {
  it('serves each organisation as the read model does, with only numbered registrations and their accreditations by year', async ({
    organisationReadRepositoryWith
  }) => {
    const granted2026 = accreditation()
    const stored = named('Acme Recycling', {
      registrations: [
        reprocessor({ accreditationId: granted2026.id }),
        exporter({ registrationNumber: null })
      ],
      accreditations: [granted2026]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const { items } = await repository.find({ page: 1, pageSize: 10 })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      organisationNumber: stored.organisationNumber,
      name: 'Acme Recycling',
      submittedToRegulator: { code: 'ea' }
    })
    expect(Object.keys(items[0].registrations)).toEqual([REPROCESSOR_NUMBER])
    expect(
      items[0].registrations[REPROCESSOR_NUMBER].accreditations[2026]
    ).toHaveProperty('accreditationNumber', ACCREDITATION_NUMBER)
  })

  it('gives an exporter on the page the details of its overseas sites', async ({
    organisationReadRepositoryWith
  }) => {
    const repository = await organisationReadRepositoryWith({
      organisations: [
        named('Acme Recycling'),
        named('Beta Exports', { registrations: [exporter()] })
      ],
      overseasSites
    })

    const { items } = await repository.find({
      search: 'beta',
      page: 1,
      pageSize: 10
    })

    expect(items[0].registrations[EXPORTER_NUMBER]).toHaveProperty(
      'overseasSites',
      { '001': approvedOverseasSite, '002': pendingOverseasSite }
    )
  })

  it('leaves out and logs an organisation that has no status yet', async ({
    organisationReadRepositoryWith
  }) => {
    const notYet = named('Acme Recycling', {
      statusHistory: [
        { status: 'created', updatedAt: new Date('2999-01-01T09:00:00Z') }
      ]
    })
    const logger = { warn: vi.fn() }
    const repository = await organisationReadRepositoryWith({
      organisations: [notYet, named('Beta Recycling')],
      logger
    })

    const { items } = await repository.find({ page: 1, pageSize: 10 })

    expect(items.map(({ name }) => name)).toEqual(['Beta Recycling'])
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining(
        `Organisation ${notYet.organisationNumber} has status undefined`
      )
    })
  })

  /*
   * Searching and counting use the organisations as they are stored, before
   * the read model leaves anything out, so a database can do both. What the
   * model leaves out still matches a search and still counts.
   */
  describe('searches and counts organisations as they are stored', () => {
    it('counts an organisation the model leaves out, so its page comes back short', async ({
      organisationReadRepositoryWith
    }) => {
      const notYet = named('Acme Recycling', {
        statusHistory: [
          { status: 'created', updatedAt: new Date('2999-01-01T09:00:00Z') }
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [notYet, named('Beta Recycling')]
      })

      const page = await repository.find({ page: 1, pageSize: 10 })

      expect(page).toMatchObject({ totalItems: 2, totalPages: 1 })
      expect(page.items.map(({ name }) => name)).toEqual(['Beta Recycling'])
    })

    it('finds an organisation by a registration the model leaves out, and serves it without that registration', async ({
      organisationReadRepositoryWith
    }) => {
      const repository = await organisationReadRepositoryWith({
        organisations: [
          named('Acme Recycling', {
            registrations: [reprocessor(), exporter({ validFrom: null })]
          })
        ]
      })

      const { items } = await repository.find({
        registrationNumber: EXPORTER_NUMBER,
        page: 1,
        pageSize: 10
      })

      expect(items).toHaveLength(1)
      expect(Object.keys(items[0].registrations)).toEqual([REPROCESSOR_NUMBER])
    })

    it('finds an organisation by an accreditation that none of its registrations holds', async ({
      organisationReadRepositoryWith
    }) => {
      const repository = await organisationReadRepositoryWith({
        organisations: [
          named('Acme Recycling', { accreditations: [accreditation()] })
        ]
      })

      const { items } = await repository.find({
        accreditationNumber: ACCREDITATION_NUMBER,
        page: 1,
        pageSize: 10
      })

      expect(items.map(({ name }) => name)).toEqual(['Acme Recycling'])
    })
  })
})
