import {
  isWithinAccreditationDateRange,
  isAccreditationSuspendedAtDate
} from './accreditation.js'

describe('accreditation date helpers', () => {
  describe('isWithinAccreditationDateRange', () => {
    it('should return true when date is within range', () => {
      const accreditation = {
        validFrom: '2025-01-01T00:00:00.000Z',
        validTo: '2025-12-31T23:59:59.999Z'
      }

      expect(
        isWithinAccreditationDateRange(
          '2025-06-15T00:00:00.000Z',
          accreditation
        )
      ).toBe(true)
    })

    it('should return false when date is before range', () => {
      const accreditation = {
        validFrom: '2025-01-01T00:00:00.000Z',
        validTo: '2025-12-31T23:59:59.999Z'
      }

      expect(
        isWithinAccreditationDateRange(
          '2024-12-31T00:00:00.000Z',
          accreditation
        )
      ).toBe(false)
    })

    it('should return false when date is after range', () => {
      const accreditation = {
        validFrom: '2025-01-01T00:00:00.000Z',
        validTo: '2025-12-31T23:59:59.999Z'
      }

      expect(
        isWithinAccreditationDateRange(
          '2026-01-01T00:00:00.000Z',
          accreditation
        )
      ).toBe(false)
    })
  })

  describe('isAccreditationSuspendedAtDate', () => {
    it('should return false when statusHistory is empty', () => {
      expect(
        isAccreditationSuspendedAtDate('2025-06-15T00:00:00.000Z', [])
      ).toBe(false)
    })

    it('should return false when statusHistory is undefined', () => {
      expect(
        isAccreditationSuspendedAtDate('2025-06-15T00:00:00.000Z', undefined)
      ).toBe(false)
    })

    it('should return false when accreditation was approved at the given date', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationSuspendedAtDate(
          '2025-06-15T00:00:00.000Z',
          statusHistory
        )
      ).toBe(false)
    })

    it('should return true when accreditation was suspended at the given date', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationSuspendedAtDate(
          '2025-06-15T00:00:00.000Z',
          statusHistory
        )
      ).toBe(true)
    })

    it('should return false when accreditation was re-approved after suspension', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-07-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationSuspendedAtDate(
          '2025-08-01T00:00:00.000Z',
          statusHistory
        )
      ).toBe(false)
    })

    it('should return true when date falls within a suspension period before re-approval', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-07-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationSuspendedAtDate(
          '2025-06-15T00:00:00.000Z',
          statusHistory
        )
      ).toBe(true)
    })

    it('should return false when date is before any status history entries', () => {
      const statusHistory = [
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationSuspendedAtDate(
          '2025-01-01T00:00:00.000Z',
          statusHistory
        )
      ).toBe(false)
    })

    it('should use the status change on the exact date boundary', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' }
      ]

      // On the exact date of suspension, the status is suspended
      expect(
        isAccreditationSuspendedAtDate(
          '2025-06-01T00:00:00.000Z',
          statusHistory
        )
      ).toBe(true)
    })

    it('should handle date on exact approval boundary', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' }
      ]

      // On the exact date of approval, the status is approved
      expect(
        isAccreditationSuspendedAtDate(
          '2025-03-01T00:00:00.000Z',
          statusHistory
        )
      ).toBe(false)
    })
  })
})
