import { describe, it, expect } from 'vitest'
import {
  determineStatusFromUpload,
  determineFailureReason,
  getDefaultStatus,
  isValidTransition,
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from './summary-log.js'

describe('summary-log domain', () => {
  describe('determineStatusFromUpload', () => {
    it('returns REJECTED when upload status is rejected', () => {
      const result = determineStatusFromUpload(UPLOAD_STATUS.REJECTED)
      expect(result).toBe(SUMMARY_LOG_STATUS.REJECTED)
    })

    it('returns PREPROCESSING when upload status is pending', () => {
      const result = determineStatusFromUpload(UPLOAD_STATUS.PENDING)
      expect(result).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })

    it('returns VALIDATING when upload status is complete', () => {
      const result = determineStatusFromUpload(UPLOAD_STATUS.COMPLETE)
      expect(result).toBe(SUMMARY_LOG_STATUS.VALIDATING)
    })

    it('throws error when upload status is invalid', () => {
      expect(() => determineStatusFromUpload('invalid')).toThrow(
        'Invalid upload status: invalid'
      )
    })
  })

  describe('determineFailureReason', () => {
    it('returns error message when provided for rejected status', () => {
      const errorMessage = 'The selected file contains a virus'
      const result = determineFailureReason(
        SUMMARY_LOG_STATUS.REJECTED,
        errorMessage
      )
      expect(result).toBe(errorMessage)
    })

    it('returns fallback message for rejected status when error message not provided', () => {
      const result = determineFailureReason(SUMMARY_LOG_STATUS.REJECTED)
      expect(result).toBe(
        'Something went wrong with your file upload. Please try again.'
      )
    })

    it('returns undefined for validating status', () => {
      const result = determineFailureReason(SUMMARY_LOG_STATUS.VALIDATING)
      expect(result).toBeUndefined()
    })

    it('returns undefined for preprocessing status', () => {
      const result = determineFailureReason(SUMMARY_LOG_STATUS.PREPROCESSING)
      expect(result).toBeUndefined()
    })

    it('returns undefined when error message provided but status is not rejected', () => {
      const errorMessage = 'The selected file contains a virus'
      const result = determineFailureReason(
        SUMMARY_LOG_STATUS.VALIDATING,
        errorMessage
      )
      expect(result).toBeUndefined()
    })
  })

  describe('getDefaultStatus', () => {
    it('returns preprocessing status', () => {
      const result = getDefaultStatus()
      expect(result).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })
  })

  describe('isValidTransition', () => {
    it('returns true when fromStatus is null (initial insert)', () => {
      const result = isValidTransition(null, SUMMARY_LOG_STATUS.PREPROCESSING)
      expect(result).toBe(true)
    })

    it('returns true when fromStatus is undefined (initial insert)', () => {
      const result = isValidTransition(
        undefined,
        SUMMARY_LOG_STATUS.PREPROCESSING
      )
      expect(result).toBe(true)
    })

    it('returns true for preprocessing -> preprocessing transition', () => {
      const result = isValidTransition(
        SUMMARY_LOG_STATUS.PREPROCESSING,
        SUMMARY_LOG_STATUS.PREPROCESSING
      )
      expect(result).toBe(true)
    })

    it('returns true for preprocessing -> rejected transition', () => {
      const result = isValidTransition(
        SUMMARY_LOG_STATUS.PREPROCESSING,
        SUMMARY_LOG_STATUS.REJECTED
      )
      expect(result).toBe(true)
    })

    it('returns true for preprocessing -> validating transition', () => {
      const result = isValidTransition(
        SUMMARY_LOG_STATUS.PREPROCESSING,
        SUMMARY_LOG_STATUS.VALIDATING
      )
      expect(result).toBe(true)
    })

    it('returns false for validating -> preprocessing transition', () => {
      const result = isValidTransition(
        SUMMARY_LOG_STATUS.VALIDATING,
        SUMMARY_LOG_STATUS.PREPROCESSING
      )
      expect(result).toBe(false)
    })

    it('returns false for validating -> rejected transition', () => {
      const result = isValidTransition(
        SUMMARY_LOG_STATUS.VALIDATING,
        SUMMARY_LOG_STATUS.REJECTED
      )
      expect(result).toBe(false)
    })

    it('returns false for rejected -> preprocessing transition', () => {
      const result = isValidTransition(
        SUMMARY_LOG_STATUS.REJECTED,
        SUMMARY_LOG_STATUS.PREPROCESSING
      )
      expect(result).toBe(false)
    })

    it('returns false for rejected -> validating transition', () => {
      const result = isValidTransition(
        SUMMARY_LOG_STATUS.REJECTED,
        SUMMARY_LOG_STATUS.VALIDATING
      )
      expect(result).toBe(false)
    })

    it('returns false for unknown fromStatus', () => {
      const result = isValidTransition(
        'unknown-status',
        SUMMARY_LOG_STATUS.PREPROCESSING
      )
      expect(result).toBe(false)
    })
  })
})
