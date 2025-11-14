import { describe, expect, it } from 'vitest'
import {
  determineFailureReason,
  determineStatusFromUpload,
  getDefaultStatus,
  SUMMARY_LOG_STATUS,
  transitionStatus,
  UPLOAD_STATUS
} from './status.js'

describe('status', () => {
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

  describe('transitionStatus', () => {
    it('returns updated summary log when fromStatus is null (initial insert)', () => {
      const summaryLog = { id: 'log-123', file: { id: 'file-1' } }
      const result = transitionStatus(
        summaryLog,
        SUMMARY_LOG_STATUS.PREPROCESSING
      )

      expect(result).toEqual({
        id: 'log-123',
        file: { id: 'file-1' },
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })
    })

    it('returns updated summary log when fromStatus is undefined (initial insert)', () => {
      const summaryLog = { id: 'log-456', file: { id: 'file-2' } }
      const result = transitionStatus(
        summaryLog,
        SUMMARY_LOG_STATUS.PREPROCESSING
      )

      expect(result).toEqual({
        id: 'log-456',
        file: { id: 'file-2' },
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })
    })

    it('returns updated summary log for preprocessing -> preprocessing transition', () => {
      const summaryLog = {
        id: 'log-789',
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        file: { id: 'file-3' }
      }
      const result = transitionStatus(
        summaryLog,
        SUMMARY_LOG_STATUS.PREPROCESSING
      )

      expect(result).toEqual({
        id: 'log-789',
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        file: { id: 'file-3' }
      })
    })

    it('returns updated summary log for preprocessing -> rejected transition', () => {
      const summaryLog = {
        id: 'log-101',
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        file: { id: 'file-4' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.REJECTED)

      expect(result).toEqual({
        id: 'log-101',
        status: SUMMARY_LOG_STATUS.REJECTED,
        file: { id: 'file-4' }
      })
    })

    it('returns updated summary log for preprocessing -> validating transition', () => {
      const summaryLog = {
        id: 'log-202',
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        file: { id: 'file-5' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATING)

      expect(result).toEqual({
        id: 'log-202',
        status: SUMMARY_LOG_STATUS.VALIDATING,
        file: { id: 'file-5' }
      })
    })

    it('throws error for validating -> preprocessing transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.PREPROCESSING)
      ).toThrow(
        'Cannot transition summary log from validating to preprocessing'
      )
    })

    it('throws error with properties for validating -> rejected transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATING }

      try {
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.REJECTED)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).toBe(
          'Cannot transition summary log from validating to rejected'
        )
        expect(error.fromStatus).toBe(SUMMARY_LOG_STATUS.VALIDATING)
        expect(error.toStatus).toBe(SUMMARY_LOG_STATUS.REJECTED)
      }
    })

    it('throws error for rejected -> preprocessing transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.REJECTED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.PREPROCESSING)
      ).toThrow('Cannot transition summary log from rejected to preprocessing')
    })

    it('throws error for rejected -> validating transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.REJECTED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATING)
      ).toThrow('Cannot transition summary log from rejected to validating')
    })

    it('throws error for unknown fromStatus', () => {
      const summaryLog = { status: 'unknown-status' }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.PREPROCESSING)
      ).toThrow(
        'Cannot transition summary log from unknown-status to preprocessing'
      )
    })

    it('returns updated summary log for validating -> validated transition', () => {
      const summaryLog = {
        id: 'log-303',
        status: SUMMARY_LOG_STATUS.VALIDATING,
        file: { id: 'file-6' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATED)

      expect(result).toEqual({
        id: 'log-303',
        status: SUMMARY_LOG_STATUS.VALIDATED,
        file: { id: 'file-6' }
      })
    })

    it('returns updated summary log for validating -> invalid transition', () => {
      const summaryLog = {
        id: 'log-404',
        status: SUMMARY_LOG_STATUS.VALIDATING,
        file: { id: 'file-7' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.INVALID)

      expect(result).toEqual({
        id: 'log-404',
        status: SUMMARY_LOG_STATUS.INVALID,
        file: { id: 'file-7' }
      })
    })

    it('returns updated summary log for validated -> submitted transition', () => {
      const summaryLog = {
        id: 'log-505',
        status: SUMMARY_LOG_STATUS.VALIDATED,
        file: { id: 'file-8' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)

      expect(result).toEqual({
        id: 'log-505',
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        file: { id: 'file-8' }
      })
    })

    it('throws error for validated -> invalid transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.INVALID)
      ).toThrow('Cannot transition summary log from validated to invalid')
    })

    it('throws error for invalid -> submitted transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.INVALID }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
      ).toThrow('Cannot transition summary log from invalid to submitted')
    })
  })
})
