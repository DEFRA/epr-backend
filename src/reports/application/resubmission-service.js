import Boom from '@hapi/boom'
import { conflict } from '#common/helpers/logging/cdp-boom.js'
import {
  RESUBMISSION_INELIGIBLE_REASON,
  isResubmissionRequired,
  resubmissionIneligibleReasonToErrorCode
} from '#reports/domain/resubmission.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import { isClosedPeriodAdjustmentsEnabled } from '#root/config.js'
import { findSubmissionByNumber } from './submission-lookup.js'

/**
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { PeriodicReport } from '#reports/repository/port.js'
 */

/**
 * Determines whether a submission is the latest submission for its period, by
 * submission number, regardless of status. Only the latest submission may be
 * unsubmitted: unsubmitting an earlier one would silently drop it from the admin
 * submission history (PAE-1657). This intentionally guards the absolute latest
 * submission, not merely the latest *submitted* one, so an earlier submitted
 * report cannot be unsubmitted while a later resubmission draft is in progress.
 * The caller separately requires the target to be submitted.
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {Promise<boolean>}
 */
export async function isLatestSubmission(
  reportsRepository,
  organisationId,
  registrationId,
  year,
  cadence,
  period,
  submissionNumber
) {
  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationId,
    registrationId
  })
  return isLatestSubmissionOf(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber
  )
}

/**
 * Whether `submissionNumber` is the highest submission number recorded for
 * its period, regardless of status — the same "absolute latest, not merely
 * latest submitted" rule {@link isLatestSubmission} enforces, extracted here
 * so it can run against a `periodicReports` list already fetched once by the
 * caller instead of each check re-fetching it.
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {boolean}
 */
export function isLatestSubmissionOf(
  periodicReports,
  year,
  cadence,
  period,
  submissionNumber
) {
  const slot = periodicReports.find((pr) => pr.year === year)?.reports?.[
    cadence
  ]?.[period]
  const submissions = [
    slot?.current,
    ...(slot?.previousSubmissions ?? [])
  ].flatMap((s) => (s ? [s.submissionNumber] : []))
  if (submissions.length === 0) {
    return false
  }
  return Math.max(...submissions) === submissionNumber
}

/**
 * Whether an operator may request resubmission on a submitted report
 * @param {PeriodicReport[]} periodicReports
 * @param {object} target
 * @param {import('#reports/domain/report-status.js').ReportStatus} target.status
 * @param {import('#reports/repository/port.js').ReportResubmissionRequired|null} [target.resubmissionRequired]
 * @param {number} target.year
 * @param {Cadence} target.cadence
 * @param {number} target.period
 * @param {number} target.submissionNumber
 * @returns {import('#reports/repository/port.js').ResubmissionIneligibleReason}
 */
export function resubmissionEligibility(periodicReports, target) {
  if (!isClosedPeriodAdjustmentsEnabled()) {
    return RESUBMISSION_INELIGIBLE_REASON.FEATURE_DISABLED
  }
  if (target.status !== REPORT_STATUS.SUBMITTED) {
    return RESUBMISSION_INELIGIBLE_REASON.NOT_SUBMITTED
  }
  if (isResubmissionRequired(target.resubmissionRequired)) {
    return RESUBMISSION_INELIGIBLE_REASON.ALREADY_REQUESTED
  }
  const { year, cadence, period, submissionNumber } = target
  if (
    !isLatestSubmissionOf(
      periodicReports,
      year,
      cadence,
      period,
      submissionNumber
    )
  ) {
    return RESUBMISSION_INELIGIBLE_REASON.NOT_LATEST_SUBMISSION
  }
  return RESUBMISSION_INELIGIBLE_REASON.ELIGIBLE
}

/**
 * Whether an operator may request resubmission on the given submitted
 * report right now. Thin boolean wrapper over {@link resubmissionEligibility}.
 * @param {PeriodicReport[]} periodicReports
 * @param {object} target
 * @param {import('#reports/domain/report-status.js').ReportStatus} target.status
 * @param {import('#reports/repository/port.js').ReportResubmissionRequired|null} [target.resubmissionRequired]
 * @param {number} target.year
 * @param {Cadence} target.cadence
 * @param {number} target.period
 * @param {number} target.submissionNumber
 * @returns {boolean}
 */
export function canRequestResubmission(periodicReports, target) {
  return (
    resubmissionEligibility(periodicReports, target) ===
    RESUBMISSION_INELIGIBLE_REASON.ELIGIBLE
  )
}

/**
 * Requests resubmission on an operator's own submitted report. Rejects
 * using {@link resubmissionEligibility}, then writes — the write can still
 * lose a race after the check passed, in which case it's rejected too.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {number} params.year
 * @param {Cadence} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @param {import('#reports/repository/port.js').UserSummary} params.requestedBy
 * @returns {Promise<import('#reports/repository/port.js').MarkSubmittedReportRequiringResubmissionByOperatorFlaggedResult>}
 */
export async function requestOperatorResubmission({
  reportsRepository,
  organisationId,
  registrationId,
  year,
  cadence,
  period,
  submissionNumber,
  requestedBy
}) {
  const reject = (reason) =>
    conflict(
      `Resubmission request not permitted for ${cadence} period ${period} of ${year} submission ${submissionNumber}`,
      reason,
      {
        event: {
          action: 'request_resubmission',
          reason: `cadence=${cadence} period=${period} year=${year} submissionNumber=${submissionNumber} rejected=${reason}`
        },
        payload: { reason }
      }
    )

  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationId,
    registrationId
  })

  const target = findSubmissionByNumber(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber
  )

  if (!target) {
    throw Boom.notFound(
      `No report found for ${cadence} period ${period} of ${year} submission ${submissionNumber}`
    )
  }

  const eligibility = resubmissionEligibility(periodicReports, {
    status: target.status,
    resubmissionRequired: target.resubmissionRequired,
    year,
    cadence,
    period,
    submissionNumber
  })

  if (eligibility !== RESUBMISSION_INELIGIBLE_REASON.ELIGIBLE) {
    throw reject(resubmissionIneligibleReasonToErrorCode(eligibility))
  }

  const result =
    await reportsRepository.markSubmittedReportRequiringResubmissionByOperator({
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber,
      requestedBy,
      requestedAt: new Date().toISOString()
    })

  if (!result) {
    throw reject(errorCodes.resubmissionRequestPreconditionFailed)
  }

  return result
}
