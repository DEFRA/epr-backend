import { describe, it, expect } from 'vitest'
import {
  determineStatusFromUpload,
  determineFailureReason,
  getDefaultStatus,
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
    it('returns failure reason for rejected status', () => {
      const result = determineFailureReason(SUMMARY_LOG_STATUS.REJECTED)
      expect(result).toBe('File rejected by virus scan')
    })

    it('returns undefined for validating status', () => {
      const result = determineFailureReason(SUMMARY_LOG_STATUS.VALIDATING)
      expect(result).toBeUndefined()
    })

    it('returns undefined for preprocessing status', () => {
      const result = determineFailureReason(SUMMARY_LOG_STATUS.PREPROCESSING)
      expect(result).toBeUndefined()
    })
  })

  describe('getDefaultStatus', () => {
    it('returns preprocessing status', () => {
      const result = getDefaultStatus()
      expect(result).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })
  })
})
