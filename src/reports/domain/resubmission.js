import { errorCodes } from '#reports/enums/error-codes.js'

/**
 * @param {import('#reports/repository/port.js').ReportResubmissionRequired|null|undefined} resubmissionRequired
 * @returns {boolean}
 */
export const isResubmissionRequired = (resubmissionRequired) =>
  Object.keys(resubmissionRequired ?? {}).length > 0

/** Reasons a submitted report may not be eligible for a manual resubmission request, plus `ELIGIBLE`. */
export const RESUBMISSION_INELIGIBLE_REASON = Object.freeze({
  FEATURE_DISABLED: 'feature-disabled',
  NOT_SUBMITTED: 'not-submitted',
  ALREADY_REQUESTED: 'already-requested',
  NOT_LATEST_SUBMISSION: 'not-latest-submission',
  ELIGIBLE: 'eligible'
})

/**
 * Maps a {@link RESUBMISSION_INELIGIBLE_REASON} to its rejection error
 * code. Never called with `ELIGIBLE`.
 * @param {import('#reports/repository/port.js').ResubmissionIneligibleReason} reason
 * @returns {string}
 */
export const resubmissionIneligibleReasonToErrorCode = (reason) => {
  switch (reason) {
    case RESUBMISSION_INELIGIBLE_REASON.FEATURE_DISABLED:
      return errorCodes.resubmissionFeatureDisabled
    case RESUBMISSION_INELIGIBLE_REASON.NOT_SUBMITTED:
      return errorCodes.reportNotSubmitted
    case RESUBMISSION_INELIGIBLE_REASON.ALREADY_REQUESTED:
      return errorCodes.resubmissionAlreadyRequested
    case RESUBMISSION_INELIGIBLE_REASON.NOT_LATEST_SUBMISSION:
      return errorCodes.reportNotLatestSubmission
    default:
      throw new Error(`Unexpected resubmission ineligible reason: ${reason}`)
  }
}
