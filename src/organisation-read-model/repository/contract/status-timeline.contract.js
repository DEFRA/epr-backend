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

    /**
     * @param {object} overrides
     */
    const organisationAccredited = (overrides) => {
      const accredited = accreditation(overrides)
      return buildOrganisation({
        registrations: [reprocessor({ accreditationId: accredited.id })],
        accreditations: [accredited]
      })
    }

    it('keeps the last status recorded on a day', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [
          registrationWith([
            { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
            { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
            { status: 'suspended', updatedAt: '2026-03-01T09:00:00.000Z' },
            { status: 'cancelled', updatedAt: '2026-03-01T15:00:00.000Z' }
          ])
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation.registrations[REPROCESSOR_NUMBER]).toMatchObject({
        statusTimeline: {
          '2026-01-01': { status: 'created' },
          '2026-02-01': { status: 'approved' },
          '2026-03-01': { status: 'cancelled' }
        }
      })
    })

    it('dates a registration’s approval at its validFrom and its other changes on the day they were recorded', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [
          reprocessor({
            validFrom: '2026-02-01',
            statusHistory: [
              { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
              { status: 'approved', updatedAt: '2026-01-20T09:00:00.000Z' },
              { status: 'suspended', updatedAt: '2026-03-01T09:00:00.000Z' },
              { status: 'cancelled', updatedAt: '2026-04-01T09:00:00.000Z' }
            ]
          })
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].statusTimeline
      ).toEqual({
        '2026-01-01': { status: 'created' },
        '2026-02-01': { status: 'approved' },
        '2026-03-01': { status: 'suspended' },
        '2026-04-01': { status: 'cancelled' }
      })
    })

    it('dates an accreditation’s approval at its validFrom and its other changes on the day they were recorded', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = organisationAccredited({
        validFrom: '2026-07-01',
        statusHistory: [
          { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
          { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
          { status: 'suspended', updatedAt: '2026-08-01T09:00:00.000Z' },
          { status: 'cancelled', updatedAt: '2026-09-01T09:00:00.000Z' }
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026]
          .statusTimeline
      ).toEqual({
        '2026-01-01': { status: 'created' },
        '2026-07-01': { status: 'approved' },
        '2026-08-01': { status: 'suspended' },
        '2026-09-01': { status: 'cancelled' }
      })
    })

    it('dates a change recorded before the first approval no later than validFrom', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = organisationAccredited({
        validFrom: '2026-01-01',
        statusHistory: [
          { status: 'created', updatedAt: '2026-10-14T14:30:47.171Z' },
          { status: 'approved', updatedAt: '2026-10-14T14:30:47.204Z' }
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026]
          .statusTimeline
      ).toEqual({ '2026-01-01': { status: 'approved' } })
    })

    it('dates a reinstatement on the day it was recorded, not at validFrom', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = organisationAccredited({
        validFrom: '2026-01-01',
        statusHistory: [
          { status: 'approved', updatedAt: '2026-01-01T09:00:00.000Z' },
          { status: 'cancelled', updatedAt: '2026-03-10T09:00:00.000Z' },
          { status: 'approved', updatedAt: '2026-03-30T09:00:00.000Z' }
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026]
          .statusTimeline
      ).toEqual({
        '2026-01-01': { status: 'approved' },
        '2026-03-10': { status: 'cancelled' },
        '2026-03-30': { status: 'approved' }
      })
    })

    it('serves an accreditation for next year approved today as approved from 1 January', async ({
      organisationReadRepositoryWith
    }) => {
      const now = new Date()
      const nextYear = now.getUTCFullYear() + 1
      const stored = organisationAccredited({
        validFrom: `${nextYear}-01-01`,
        validTo: `${nextYear}-12-31`,
        statusHistory: [
          { status: 'created', updatedAt: now.toISOString() },
          { status: 'approved', updatedAt: now.toISOString() }
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations[nextYear]
      ).toMatchObject({
        status: 'approved',
        statusTimeline: {
          [now.toISOString().slice(0, 10)]: { status: 'created' },
          [`${nextYear}-01-01`]: { status: 'approved' }
        }
      })
    })

    it('serves the stored status even when a change to it is dated in the future', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = organisationAccredited({
        statusHistory: [
          { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
          { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
          { status: 'suspended', updatedAt: '2999-01-01T09:00:00.000Z' }
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026]
      ).toMatchObject({
        status: 'suspended',
        statusTimeline: { '2999-01-01': { status: 'suspended' } }
      })
    })

    it('dates an organisation’s approval on the day it was recorded', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        statusHistory: [
          { status: 'created', updatedAt: new Date('2026-01-01T09:00:00Z') },
          { status: 'approved', updatedAt: new Date('2026-02-01T09:00:00Z') }
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation).toMatchObject({
        status: 'approved',
        statusTimeline: {
          '2026-01-01': { status: 'created' },
          '2026-02-01': { status: 'approved' }
        }
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
