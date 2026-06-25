import { describe, it, expect } from 'vitest'
import { buildOrganisation, buildReadOrganisation } from './test-data.js'
import { getCurrentStatus } from '../status.js'

describe('test-data', () => {
  describe('buildOrganisation', () => {
    it('should not expose a top-level status (insert-shaped fixture)', () => {
      const org = buildOrganisation()

      expect(org).not.toHaveProperty('status')
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
