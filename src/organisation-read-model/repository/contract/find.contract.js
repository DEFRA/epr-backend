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
} from './organisation-read-test-helpers.js'

const { buildOrganisation, nextOrgId } = createOrganisationBuilders()

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

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
      reprocessor({ registrationNumber: `R26ER${nextOrgId()}PL` })
    ],
    accreditations: [],
    ...overrides
  })

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testFindBehaviour = (it) => {
  describe('find', () => {
    it('returns the organisations matching the criteria a page at a time, sorted by name', async ({
      organisationReadRepositoryWith
    }) => {
      const repository = await organisationReadRepositoryWith({
        organisations: [
          named('Zeta Recycling'),
          named('Acme Recycling'),
          named('Beta Recycling'),
          named('Unrelated Ltd')
        ]
      })

      const page = await repository.find({
        search: 'recycling',
        page: 1,
        pageSize: 2
      })

      expect(page).toMatchObject({
        page: 1,
        pageSize: 2,
        totalItems: 3,
        totalPages: 2
      })
      expect(page.items.map(({ name }) => name)).toEqual([
        'Acme Recycling',
        'Beta Recycling'
      ])
    })

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
        organisationNumber: String(stored.orgId),
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
          `Organisation ${notYet.orgId} has status undefined`
        )
      })
    })
  })
}
