import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  findOrganisation,
  reprocessor
} from './organisation-read-test-helpers.js'

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testStatusTimelineBehaviour = (it) => {
  describe('status timeline', () => {
    /**
     * @param {object[]} statusHistory
     */
    const registrationWith = (statusHistory) => reprocessor({ statusHistory })

    it('keeps the last status recorded on a day', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [
          registrationWith([
            { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
            { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
            { status: 'cancelled', updatedAt: '2026-03-01T09:00:00.000Z' },
            { status: 'approved', updatedAt: '2026-03-01T15:00:00.000Z' }
          ])
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation.registrations[REPROCESSOR_NUMBER]).toMatchObject({
        status: 'approved',
        statusTimeline: {
          '2026-01-01': { status: 'created' },
          '2026-02-01': { status: 'approved' },
          '2026-03-01': { status: 'approved' }
        }
      })
    })

    it('takes the status from the latest day on or before today, not the last recorded', async ({
      organisationReadRepositoryWith
    }) => {
      const granted = accreditation({
        statusHistory: [
          { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
          { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
          { status: 'suspended', updatedAt: '2999-01-01T09:00:00.000Z' }
        ]
      })
      const stored = buildOrganisation({
        registrations: [reprocessor({ accreditationId: granted.id })],
        accreditations: [granted]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026]
      ).toMatchObject({
        status: 'approved',
        statusTimeline: { '2999-01-01': { status: 'suspended' } }
      })
    })

    it('finds no organisation that has no status yet', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        statusHistory: [
          { status: 'created', updatedAt: new Date('2999-01-01T09:00:00Z') }
        ]
      })
      const logger = { warn: vi.fn() }
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        logger
      })

      expect(await repository.findByOrganisationNumber(stored.orgId)).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith({
        message: expect.stringContaining(
          `Organisation ${stored.orgId} has status undefined`
        )
      })
    })
  })
}
