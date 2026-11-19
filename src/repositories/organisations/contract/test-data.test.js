import { describe, it, expect } from 'vitest'
import { buildRegistration, createOrganisationBuilders } from './test-data.js'
import { getCurrentStatus } from '../status.js'
import { partialMock } from '#test/type-helpers.js'

const {
  buildOrganisation,
  buildOrganisationWithRegistration,
  buildReadOrganisation
} = createOrganisationBuilders()

describe('test-data', () => {
  describe('buildOrganisation', () => {
    it('should not expose a top-level status (insert-shaped fixture)', () => {
      const org = buildOrganisation()

      expect(org).not.toHaveProperty('status')
    })
  })

  describe('buildOrganisationWithRegistration', () => {
    it('should not link an accreditation when no accreditation status is given', () => {
      const registration = buildRegistration({ accreditationId: 'acc-1' })

      const org = buildOrganisationWithRegistration(partialMock(registration))

      expect(org.accreditations.map(({ id }) => id)).not.toContain('acc-1')
    })

    it('should link a matching accreditation with the given status', () => {
      const registration = buildRegistration({ accreditationId: 'acc-1' })

      const org = buildOrganisationWithRegistration(
        partialMock(registration),
        'approved'
      )

      expect(org.accreditations).toEqual([
        expect.objectContaining({
          id: 'acc-1',
          wasteProcessingType: registration.wasteProcessingType,
          statusHistory: [
            expect.objectContaining({ status: 'created' }),
            expect.objectContaining({ status: 'approved' })
          ]
        })
      ])
    })
  })

  describe('createOrganisationBuilders', () => {
    it('should never hand out the same organisation number twice from one set of builders', () => {
      const builders = createOrganisationBuilders()
      const draws = [
        () => builders.buildOrganisation().organisationNumber,
        (/** @type {number} */ index) =>
          builders.buildOrgWithName(`Org ${index}`).organisationNumber,
        () => builders.nextOrganisationNumber()
      ]

      const numbers = Array.from({ length: 999 }, (_, index) =>
        draws[index % draws.length](index)
      )

      expect(new Set(numbers).size).toBe(numbers.length)
    })
  })

  describe('buildReadOrganisation', () => {
    it('should expose a top-level status derived from statusHistory', () => {
      const org = buildReadOrganisation()

      expect(org.status).toBe(getCurrentStatus(org))
    })

    it('should default the status to created', () => {
      const org = buildReadOrganisation()

      expect(org.status).toBe('created')
    })

    it('should derive status from a statusHistory override', () => {
      const org = buildReadOrganisation({
        statusHistory: [
          { status: 'created', updatedAt: new Date('2024-01-01') },
          { status: 'approved', updatedAt: new Date('2024-02-01') }
        ]
      })

      expect(org.status).toBe('approved')
    })

    it('should derive a status for each registration and accreditation', () => {
      const org = buildReadOrganisation()

      const everyItemHasStatus = [
        ...org.registrations,
        ...org.accreditations
      ].every((item) => item.status === getCurrentStatus(item))

      expect(everyItemHasStatus).toBe(true)
    })
  })
})
