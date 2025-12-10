import { describe, expect, it } from 'vitest'
import {
  createRejectedValidation,
  determineStatusFromUpload,
  getDefaultStatus,
  mapUploaderErrorToCode,
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

    it('returns updated summary log for validated -> submitting transition', () => {
      const summaryLog = {
        id: 'log-606',
        status: SUMMARY_LOG_STATUS.VALIDATED,
        file: { id: 'file-9' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTING)

      expect(result).toEqual({
        id: 'log-606',
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        file: { id: 'file-9' }
      })
    })

    it('returns updated summary log for submitting -> submitted transition', () => {
      const summaryLog = {
        id: 'log-707',
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        file: { id: 'file-10' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)

      expect(result).toEqual({
        id: 'log-707',
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        file: { id: 'file-10' }
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

    it('returns updated summary log for preprocessing -> superseded transition', () => {
      const summaryLog = {
        id: 'log-808',
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        file: { id: 'file-11' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)

      expect(result).toEqual({
        id: 'log-808',
        status: SUMMARY_LOG_STATUS.SUPERSEDED,
        file: { id: 'file-11' }
      })
    })

    it('returns updated summary log for validating -> superseded transition', () => {
      const summaryLog = {
        id: 'log-909',
        status: SUMMARY_LOG_STATUS.VALIDATING,
        file: { id: 'file-12' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)

      expect(result).toEqual({
        id: 'log-909',
        status: SUMMARY_LOG_STATUS.SUPERSEDED,
        file: { id: 'file-12' }
      })
    })

    it('returns updated summary log for validated -> superseded transition', () => {
      const summaryLog = {
        id: 'log-1010',
        status: SUMMARY_LOG_STATUS.VALIDATED,
        file: { id: 'file-13' }
      }
      const result = transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)

      expect(result).toEqual({
        id: 'log-1010',
        status: SUMMARY_LOG_STATUS.SUPERSEDED,
        file: { id: 'file-13' }
      })
    })

    it('throws error for superseded -> any transition (terminal state)', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUPERSEDED }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.PREPROCESSING)
      ).toThrow(
        'Cannot transition summary log from superseded to preprocessing'
      )
    })

    it('throws error for submitting -> superseded transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.SUBMITTING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)
      ).toThrow('Cannot transition summary log from submitting to superseded')
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

    it('throws error for validating -> submitting transition', () => {
      const summaryLog = { status: SUMMARY_LOG_STATUS.VALIDATING }

      expect(() =>
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTING)
      ).toThrow('Cannot transition summary log from validating to submitting')
    })
  })
})
