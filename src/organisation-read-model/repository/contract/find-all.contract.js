import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { reprocessor } from './organisation-read-test-helpers.js'

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
export const testFindAllBehaviour = (it) => {
  describe('findAll', () => {
    it('returns all items', async ({ organisationReadRepositoryWith }) => {
      const repository = await organisationReadRepositoryWith({
        organisations: [
          named('Zeta Recycling'),
          named('Acme Recycling'),
          named('Beta Recycling')
        ]
      })

      const items = await repository.findAll()

      expect(items.map(({ name }) => name)).toStrictEqual([
        'Zeta Recycling',
        'Acme Recycling',
        'Beta Recycling'
      ])
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
        organisations: [
          named('Zeta Recycling'),
          notYet,
          named('Beta Recycling')
        ],
        logger
      })

      const items = await repository.findAll()

      expect(items.map(({ name }) => name)).toStrictEqual([
        'Zeta Recycling',
        'Beta Recycling'
      ])
      expect(logger.warn).toHaveBeenCalledWith({
        message: expect.stringContaining(
          `Organisation ${notYet.orgId} has status undefined`
        )
      })
    })
  })
}
