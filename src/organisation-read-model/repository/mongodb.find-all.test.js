import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { reprocessor } from './contract/organisation-read-test-helpers.js'
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

describe('findAll', () => {
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
      organisations: [named('Zeta Recycling'), notYet],
      logger
    })

    const organisations = await repository.findAll()

    expect(organisations.map(({ name }) => name)).toStrictEqual([
      'Zeta Recycling'
    ])
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining(
        `Organisation ${notYet.organisationNumber} has status undefined`
      )
    })
  })
})
