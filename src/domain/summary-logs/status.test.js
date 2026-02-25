import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createRejectedValidation,
  determineStatusFromUpload,
  getDefaultStatus,
  mapUploaderErrorToCode,
  SUMMARY_LOG_STATUS,
  transitionStatus,
  UPLOAD_STATUS
} from './status.js'

const FIXED_NOW = new Date('2024-12-19T12:00:00.000Z')
const TWENTY_MINUTES_LATER = new Date('2024-12-19T12:20:00.000Z')
const ONE_DAY_LATER = new Date('2024-12-20T12:00:00.000Z')
const ONE_WEEK_LATER = new Date('2024-12-26T12:00:00.000Z')

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

  describe('mapUploaderErrorToCode', () => {
    it('returns FILE_VIRUS_DETECTED for virus error message', () => {
      const result = mapUploaderErrorToCode(
        'The selected file contains a virus'
      )
      expect(result).toBe('FILE_VIRUS_DETECTED')
    })

    it('returns FILE_EMPTY for empty file error message', () => {
      const result = mapUploaderErrorToCode('The selected file is empty')
      expect(result).toBe('FILE_EMPTY')
    })

    it('returns FILE_TOO_LARGE for file size error message', () => {
      const result = mapUploaderErrorToCode(
        'The selected file must be smaller than 10MB'
      )
      expect(result).toBe('FILE_TOO_LARGE')
    })

    it('returns FILE_WRONG_TYPE for mime type error message', () => {
      const result = mapUploaderErrorToCode(
        'The selected file must be a PDF or XLSX'
      )
      expect(result).toBe('FILE_WRONG_TYPE')
    })

    it('returns FILE_UPLOAD_FAILED for upload error message', () => {
      const result = mapUploaderErrorToCode(
        'The selected file could not be uploaded – try again'
      )
      expect(result).toBe('FILE_UPLOAD_FAILED')
    })

    it('returns FILE_DOWNLOAD_FAILED for download error message', () => {
      const result = mapUploaderErrorToCode(
        'The selected file could not be downloaded'
      )
      expect(result).toBe('FILE_DOWNLOAD_FAILED')
    })

    it('returns FILE_REJECTED for unknown error message', () => {
      const result = mapUploaderErrorToCode('Some unknown error')
      expect(result).toBe('FILE_REJECTED')
    })

    it('returns FILE_REJECTED when error message is undefined', () => {
      const result = mapUploaderErrorToCode(undefined)
      expect(result).toBe('FILE_REJECTED')
    })

    it('returns FILE_REJECTED when error message is null', () => {
      const result = mapUploaderErrorToCode(null)
      expect(result).toBe('FILE_REJECTED')
    })
  })

  describe('createRejectedValidation', () => {
    it('returns validation object with failures array', () => {
      const result = createRejectedValidation('The selected file is empty')
      expect(result).toEqual({
        failures: [{ code: 'FILE_EMPTY' }]
      })
    })

    it('returns FILE_REJECTED code when no error message provided', () => {
      const result = createRejectedValidation()
      expect(result).toEqual({
        failures: [{ code: 'FILE_REJECTED' }]
      })
    })
  })

  describe('getDefaultStatus', () => {
    it('returns preprocessing status', () => {
      const result = getDefaultStatus()
      expect(result).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })
  })

  describe('transitionStatus', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(FIXED_NOW)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns status update when fromStatus is null (initial insert)', () => {
      const summaryLog = { id: 'log-123', file: { id: 'file-1' } }
      const result = transitionStatus(
        summaryLog,
        SUMMARY_LOG_STATUS.PREPROCESSING
      )

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        expiresAt: ONE_DAY_LATER
      })
    })

    it('returns status update when fromStatus is undefined (initial insert)', () => {
      const summaryLog = { id: 'log-456', file: { id: 'file-2' } }
      const result = transitionStatus(
        summaryLog,
        SUMMARY_LOG_STATUS.PREPROCESSING
      )

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        expiresAt: ONE_DAY_LATER
      })
    })

    it('returns status update for preprocessing -> preprocessing transition', () => {
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
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        expiresAt: ONE_DAY_LATER
      })
    })

    it('returns status update for preprocessing -> rejected transition', () => {
      const summaryLog = {
        id: 'log-101',
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        file: { id: 'file-4' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.REJECTED)

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.REJECTED,
        expiresAt: ONE_DAY_LATER
      })
    })

    it('returns status update for preprocessing -> validating transition', () => {
      const summaryLog = {
        id: 'log-202',
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        file: { id: 'file-5' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATING)

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.VALIDATING,
        expiresAt: ONE_DAY_LATER
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

      let thrownError
      try {
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.REJECTED)
      } catch (e) {
        thrownError = e
      }

      expect(thrownError?.message).toBe(
        'Cannot transition summary log from validating to rejected'
      )
      expect(thrownError?.fromStatus).toBe(SUMMARY_LOG_STATUS.VALIDATING)
      expect(thrownError?.toStatus).toBe(SUMMARY_LOG_STATUS.REJECTED)
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

    it('returns status update for validating -> validated transition', () => {
      const summaryLog = {
        id: 'log-303',
        status: SUMMARY_LOG_STATUS.VALIDATING,
        file: { id: 'file-6' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATED)

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.VALIDATED,
        expiresAt: ONE_WEEK_LATER
      })
    })

    it('returns status update for validating -> invalid transition', () => {
      const summaryLog = {
        id: 'log-404',
        status: SUMMARY_LOG_STATUS.VALIDATING,
        file: { id: 'file-7' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.INVALID)

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.INVALID,
        expiresAt: ONE_WEEK_LATER
      })
    })

    it('throws error for validated -> submitted transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
      ).toThrow('Cannot transition summary log from validated to submitted')
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

    it('returns status update for validated -> submitting transition', () => {
      const summaryLog = {
        id: 'log-606',
        status: SUMMARY_LOG_STATUS.VALIDATED,
        file: { id: 'file-9' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTING)

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        expiresAt: TWENTY_MINUTES_LATER
      })
    })

    it('returns status update for submitting -> submitted transition', () => {
      const summaryLog = {
        id: 'log-707',
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        file: { id: 'file-10' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        expiresAt: null
      })
    })

    it('returns status update for submitting -> superseded transition (stale preview)', () => {
      const summaryLog = {
        id: 'log-stale-preview',
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        file: { id: 'file-stale' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.SUPERSEDED,
        expiresAt: ONE_DAY_LATER
      })
    })

    it('throws error for submitting -> validated transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUBMITTING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATED)
      ).toThrow('Cannot transition summary log from submitting to validated')
    })

    it('throws error for submitting -> invalid transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUBMITTING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.INVALID)
      ).toThrow('Cannot transition summary log from submitting to invalid')
    })

    it.each([
      SUMMARY_LOG_STATUS.PREPROCESSING,
      SUMMARY_LOG_STATUS.VALIDATING,
      SUMMARY_LOG_STATUS.VALIDATED
    ])('throws error for %s -> superseded transition', (fromStatus) => {
      const summaryLog = { status: fromStatus }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)
      ).toThrow(
        `Cannot transition summary log from ${fromStatus} to superseded`
      )
    })

    it('throws error for superseded -> any transition (terminal state)', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUPERSEDED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.PREPROCESSING)
      ).toThrow(
        'Cannot transition summary log from superseded to preprocessing'
      )
    })

    it('throws error for submitted -> superseded transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUBMITTED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)
      ).toThrow('Cannot transition summary log from submitted to superseded')
    })

    it('throws error for preprocessing -> submitting transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.PREPROCESSING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTING)
      ).toThrow(
        'Cannot transition summary log from preprocessing to submitting'
      )
    })

    // VALIDATION_FAILED status transitions
    it('returns status update for preprocessing -> validation_failed transition', () => {
      const summaryLog = {
        id: 'log-validation-failed-1',
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        file: { id: 'file-11' }
      }
      const result = transitionStatus(
        summaryLog,
        SUMMARY_LOG_STATUS.VALIDATION_FAILED
      )

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.VALIDATION_FAILED,
        expiresAt: ONE_DAY_LATER
      })
    })

    it('returns status update for validating -> validation_failed transition', () => {
      const summaryLog = {
        id: 'log-validation-failed-2',
        status: SUMMARY_LOG_STATUS.VALIDATING,
        file: { id: 'file-12' }
      }
      const result = transitionStatus(
        summaryLog,
        SUMMARY_LOG_STATUS.VALIDATION_FAILED
      )

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.VALIDATION_FAILED,
        expiresAt: ONE_DAY_LATER
      })
    })

    it('throws error for validation_failed -> any transition (terminal state)', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATION_FAILED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.PREPROCESSING)
      ).toThrow(
        'Cannot transition summary log from validation_failed to preprocessing'
      )

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATING)
      ).toThrow(
        'Cannot transition summary log from validation_failed to validating'
      )

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATED)
      ).toThrow(
        'Cannot transition summary log from validation_failed to validated'
      )
    })

    it('throws error for validated -> validation_failed transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATION_FAILED)
      ).toThrow(
        'Cannot transition summary log from validated to validation_failed'
      )
    })

    it('throws error for submitted -> validation_failed transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUBMITTED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATION_FAILED)
      ).toThrow(
        'Cannot transition summary log from submitted to validation_failed'
      )
    })

    it('throws error for invalid -> validation_failed transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.INVALID }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATION_FAILED)
      ).toThrow(
        'Cannot transition summary log from invalid to validation_failed'
      )
    })

    it('throws error for rejected -> validation_failed transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.REJECTED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATION_FAILED)
      ).toThrow(
        'Cannot transition summary log from rejected to validation_failed'
      )
    })

    it('throws error for submitting -> validation_failed transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUBMITTING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATION_FAILED)
      ).toThrow(
        'Cannot transition summary log from submitting to validation_failed'
      )
    })

    it('throws error for validating -> submitting transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTING)
      ).toThrow('Cannot transition summary log from validating to submitting')
    })

    // SUBMISSION_FAILED status transitions
    it('returns status update for submitting -> submission_failed transition', () => {
      const summaryLog = {
        id: 'log-submission-failed-1',
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        file: { id: 'file-13' }
      }
      const result = transitionStatus(
        summaryLog,
        SUMMARY_LOG_STATUS.SUBMISSION_FAILED
      )

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.SUBMISSION_FAILED,
        expiresAt: ONE_DAY_LATER
      })
    })

    it('throws error for submission_failed -> any transition (terminal state)', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUBMISSION_FAILED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.PREPROCESSING)
      ).toThrow(
        'Cannot transition summary log from submission_failed to preprocessing'
      )

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTING)
      ).toThrow(
        'Cannot transition summary log from submission_failed to submitting'
      )

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
      ).toThrow(
        'Cannot transition summary log from submission_failed to submitted'
      )
    })

    it('throws error for preprocessing -> submission_failed transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.PREPROCESSING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMISSION_FAILED)
      ).toThrow(
        'Cannot transition summary log from preprocessing to submission_failed'
      )
    })

    it('throws error for validating -> submission_failed transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMISSION_FAILED)
      ).toThrow(
        'Cannot transition summary log from validating to submission_failed'
      )
    })

    it('throws error for validated -> submission_failed transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMISSION_FAILED)
      ).toThrow(
        'Cannot transition summary log from validated to submission_failed'
      )
    })

    it('throws error for submitted -> submission_failed transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUBMITTED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMISSION_FAILED)
      ).toThrow(
        'Cannot transition summary log from submitted to submission_failed'
      )
    })
  })
})
