import {
  RESUBMISSION_INELIGIBLE_REASON,
  isResubmissionRequired,
  resubmissionIneligibleReasonToErrorCode
} from './resubmission.js'

describe('isResubmissionRequired', () => {
  it('returns false for null', () => {
    expect(isResubmissionRequired(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isResubmissionRequired(undefined)).toBe(false)
  })

  it('returns false for an empty object', () => {
    expect(isResubmissionRequired({})).toBe(false)
  })

  it('returns true when closedPeriodRestated is set', () => {
    expect(
      isResubmissionRequired({
        closedPeriodRestated: { uploadedAt: '2026-01-01', summaryLogId: 'sl-1' }
      })
    ).toBe(true)
  })

  it('returns true when operatorRequested is set', () => {
    expect(
      isResubmissionRequired({
        operatorRequested: {
          requestedAt: '2026-01-01',
          requestedBy: { id: 'user-1', name: 'Alice', position: 'Officer' }
        }
      })
    ).toBe(true)
  })
})

describe('resubmissionIneligibleReasonToErrorCode', () => {
  it('maps FEATURE_DISABLED', () => {
    expect(
      resubmissionIneligibleReasonToErrorCode(
        RESUBMISSION_INELIGIBLE_REASON.FEATURE_DISABLED
      )
    ).toBe('resubmission_feature_disabled')
  })

  it('maps NOT_SUBMITTED', () => {
    expect(
      resubmissionIneligibleReasonToErrorCode(
        RESUBMISSION_INELIGIBLE_REASON.NOT_SUBMITTED
      )
    ).toBe('report_not_submitted')
  })

  it('maps ALREADY_REQUESTED', () => {
    expect(
      resubmissionIneligibleReasonToErrorCode(
        RESUBMISSION_INELIGIBLE_REASON.ALREADY_REQUESTED
      )
    ).toBe('resubmission_already_requested')
  })

  it('maps NOT_LATEST_SUBMISSION', () => {
    expect(
      resubmissionIneligibleReasonToErrorCode(
        RESUBMISSION_INELIGIBLE_REASON.NOT_LATEST_SUBMISSION
      )
    ).toBe('report_not_latest_submission')
  })

  it('throws for an unrecognised reason', () => {
    expect(() =>
      resubmissionIneligibleReasonToErrorCode(
        /** @type {any} */ ('not-a-real-reason')
      )
    ).toThrow('Unexpected resubmission ineligible reason: not-a-real-reason')
  })
})
