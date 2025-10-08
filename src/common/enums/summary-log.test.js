import { describe, it, expect } from 'vitest'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS,
  determineSummaryLogStatus
} from './summary-log.js'

describe('summary-log enums', () => {
  describe('determineSummaryLogStatus', () => {
    it('returns REJECTED when upload status is rejected', () => {
      const result = determineSummaryLogStatus(UPLOAD_STATUS.REJECTED)
      expect(result).toBe(SUMMARY_LOG_STATUS.REJECTED)
    })

    it('returns PREPROCESSING when upload status is pending', () => {
      const result = determineSummaryLogStatus(UPLOAD_STATUS.PENDING)
      expect(result).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })

    it('returns VALIDATING when upload status is complete', () => {
      const result = determineSummaryLogStatus(UPLOAD_STATUS.COMPLETE)
      expect(result).toBe(SUMMARY_LOG_STATUS.VALIDATING)
    })

    it('throws error when upload status is invalid', () => {
      expect(() => determineSummaryLogStatus('invalid')).toThrow(
        'Invalid upload status: invalid'
      )
    })
  })
})
