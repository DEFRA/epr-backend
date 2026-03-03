import {
  isWithinAccreditationDateRange,
  isAccreditationApprovedAtDate
} from './accreditation.js'

describe('accreditation date helpers', () => {
  describe('isWithinAccreditationDateRange', () => {
    const accreditation = {
      validFrom: '2025-01-01T00:00:00.000Z',
      validTo: '2025-12-31T23:59:59.999Z'
    }

    it.each([
      {
        date: '2025-06-15T00:00:00.000Z',
        expected: true,
        desc: 'within range'
      },
      {
        date: '2024-12-31T00:00:00.000Z',
        expected: false,
        desc: 'before range'
      },
      {
        date: '2025-01-01T00:00:00.000Z',
        expected: true,
        desc: 'on validFrom boundary'
      },
      {
        date: '2025-12-31T23:59:59.999Z',
        expected: true,
        desc: 'on validTo boundary'
      },
      { date: '2026-01-01T00:00:00.000Z', expected: false, desc: 'after range' }
    ])('should return $expected when date is $desc', ({ date, expected }) => {
      expect(isWithinAccreditationDateRange(date, accreditation)).toBe(expected)
    })
  })

  describe('isAccreditationApprovedAtDate', () => {
    it('should return false when statusHistory is empty', () => {
      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', [])
      ).toBe(false)
    })

    it('should return false when statusHistory is undefined', () => {
      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', undefined)
      ).toBe(false)
    })

    it('should return true when accreditation was approved at the given date', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false when accreditation was suspended at the given date', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return true when accreditation was re-approved after suspension', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-07-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-08-01T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false when date falls within a suspension period before re-approval', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-07-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return false when date is before any status history entries', () => {
      const statusHistory = [
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-01-01T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should use the status change on the exact date boundary', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' }
      ]

      // On the exact date of suspension, the status is not approved
      expect(
        isAccreditationApprovedAtDate('2025-06-01T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should handle out-of-order statusHistory entries', () => {
      const statusHistory = [
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' },
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-07-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' }
      ]

      // During suspension window - not approved
      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)

      // After re-approval - approved
      expect(
        isAccreditationApprovedAtDate('2025-08-01T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false when statusHistory is null', () => {
      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', null)
      ).toBe(false)
    })

    it('should return false with a single suspended entry', () => {
      const statusHistory = [
        { status: 'suspended', updatedAt: '2025-01-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should use the first entry when multiple share the same timestamp', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-06-01T00:00:00.000Z' }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return true on exact approval boundary', () => {
      const statusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-03-01T00:00:00.000Z' }
      ]

      // On the exact date of approval, the status is approved
      expect(
        isAccreditationApprovedAtDate('2025-03-01T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })
  })
})
