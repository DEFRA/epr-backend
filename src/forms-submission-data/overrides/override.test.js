import { describe, expect, it } from 'vitest'
import {
  applyAccreditationOverrides,
  applyRegistrationOverrides
} from './override.js'

describe('Override Functions', () => {
  describe('applyRegistrationOverrides', () => {
    it('should apply systemReference override when registration id matches', () => {
      // Note: Tests use anonymized MongoDB ObjectIds, not production IDs
      const testSubmission = {
        id: '507f1f77bcf86cd799439011',
        systemReference: '65a000000000000000000000', // Original incorrect value
        regulator: 'EA',
        organisationId: '500000'
      }

      const result = applyRegistrationOverrides(testSubmission)

      // Should override systemReference to the corrected value
      expect(result.systemReference).toBe('507f191e810c19729de860ea')
      // Other attributes should remain unchanged
      expect(result.id).toBe('507f1f77bcf86cd799439011')
      expect(result.regulator).toBe('EA')
      expect(result.organisationId).toBe('500000')
    })

    it('should return unchanged submission when id does not match any override', () => {
      const testSubmission = {
        id: '507f1f77bcf86cd799439999',
        systemReference: '68a66ec3dabf09f3e442b2da',
        regulator: 'EA',
        organisationId: '500000'
      }

      const result = applyRegistrationOverrides(testSubmission)

      // Should return the submission unchanged
      expect(result).toEqual(testSubmission)
    })
  })

  describe('applyAccreditationOverrides', () => {
    it('should apply systemReference override when accreditation id matches', () => {
      // Note: Tests use anonymized MongoDB ObjectIds, not production IDs
      const testSubmission = {
        id: '65a2f4e8b4c5d9f8e7a6b1c2',
        systemReference: '65a000000000000000000000', // Original incorrect value
        regulator: 'EA',
        organisationId: '500000'
      }

      const result = applyAccreditationOverrides(testSubmission)

      // Should override systemReference to the corrected value
      expect(result.systemReference).toBe('65a2f5a1b4c5d9f8e7a6b1c3')
      // Other attributes should remain unchanged
      expect(result.id).toBe('65a2f4e8b4c5d9f8e7a6b1c2')
      expect(result.regulator).toBe('EA')
      expect(result.organisationId).toBe('500000')
    })

    it('should return unchanged submission when id does not match any override', () => {
      const testSubmission = {
        id: '65a2f4e8b4c5d9f8e7a69999',
        systemReference: '68a66ec3dabf09f3e442b2da',
        regulator: 'EA',
        organisationId: '500000'
      }

      const result = applyAccreditationOverrides(testSubmission)

      // Should return the submission unchanged
      expect(result).toEqual(testSubmission)
    })
  })
})
