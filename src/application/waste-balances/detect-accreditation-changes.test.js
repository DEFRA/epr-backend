import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { detectAccreditationStatusChanges } from './detect-accreditation-changes.js'

describe('detectAccreditationStatusChanges', () => {
  const buildOrg = (accreditations = []) => ({
    accreditations
  })

  const buildAccreditation = (id, status) => ({ id, status })

  describe('when an accreditation changes from created to approved', () => {
    it('returns the change', () => {
      const initial = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.CREATED)
      ])
      const updated = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.APPROVED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([
        {
          accreditationId: 'acc-1',
          previousStatus: REG_ACC_STATUS.CREATED,
          currentStatus: REG_ACC_STATUS.APPROVED
        }
      ])
    })
  })

  describe('when an accreditation changes from approved to suspended', () => {
    it('returns the change', () => {
      const initial = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.APPROVED)
      ])
      const updated = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.SUSPENDED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([
        {
          accreditationId: 'acc-1',
          previousStatus: REG_ACC_STATUS.APPROVED,
          currentStatus: REG_ACC_STATUS.SUSPENDED
        }
      ])
    })
  })

  describe('when an accreditation changes from approved to cancelled', () => {
    it('returns the change', () => {
      const initial = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.APPROVED)
      ])
      const updated = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.CANCELLED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([
        {
          accreditationId: 'acc-1',
          previousStatus: REG_ACC_STATUS.APPROVED,
          currentStatus: REG_ACC_STATUS.CANCELLED
        }
      ])
    })
  })

  describe('when a status changes between non-approved statuses', () => {
    it('returns no changes for created to rejected', () => {
      const initial = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.CREATED)
      ])
      const updated = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.REJECTED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([])
    })

    it('returns no changes for suspended to cancelled', () => {
      const initial = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.SUSPENDED)
      ])
      const updated = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.CANCELLED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([])
    })
  })

  describe('when the status has not changed', () => {
    it('returns no changes', () => {
      const initial = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.APPROVED)
      ])
      const updated = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.APPROVED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([])
    })
  })

  describe('when multiple accreditations change', () => {
    it('returns all relevant changes', () => {
      const initial = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.CREATED),
        buildAccreditation('acc-2', REG_ACC_STATUS.APPROVED),
        buildAccreditation('acc-3', REG_ACC_STATUS.CREATED)
      ])
      const updated = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.APPROVED),
        buildAccreditation('acc-2', REG_ACC_STATUS.SUSPENDED),
        buildAccreditation('acc-3', REG_ACC_STATUS.REJECTED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toHaveLength(2)
      expect(result[0].accreditationId).toBe('acc-1')
      expect(result[1].accreditationId).toBe('acc-2')
    })
  })

  describe('when a new accreditation appears in the updated snapshot', () => {
    it('returns the change if the new status is approved', () => {
      const initial = buildOrg([])
      const updated = buildOrg([
        buildAccreditation('acc-new', REG_ACC_STATUS.APPROVED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([
        {
          accreditationId: 'acc-new',
          previousStatus: undefined,
          currentStatus: REG_ACC_STATUS.APPROVED
        }
      ])
    })

    it('returns no changes if the new status is not approved', () => {
      const initial = buildOrg([])
      const updated = buildOrg([
        buildAccreditation('acc-new', REG_ACC_STATUS.CREATED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([])
    })
  })

  describe('when accreditations array is missing or empty', () => {
    it('handles missing accreditations on initial', () => {
      const initial = {}
      const updated = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.APPROVED)
      ])

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([
        {
          accreditationId: 'acc-1',
          previousStatus: undefined,
          currentStatus: REG_ACC_STATUS.APPROVED
        }
      ])
    })

    it('handles missing accreditations on updated', () => {
      const initial = buildOrg([
        buildAccreditation('acc-1', REG_ACC_STATUS.APPROVED)
      ])
      const updated = {}

      const result = detectAccreditationStatusChanges(initial, updated)

      expect(result).toEqual([])
    })

    it('handles both empty', () => {
      const result = detectAccreditationStatusChanges(
        buildOrg([]),
        buildOrg([])
      )

      expect(result).toEqual([])
    })
  })
})
