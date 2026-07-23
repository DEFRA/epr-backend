import { badRequest, conflict } from '#common/helpers/logging/cdp-boom.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { isResubmissionRequired } from '#reports/domain/resubmission.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import { isClosedPeriodAdjustmentsEnabled } from '#root/config.js'
import { findSubmissionByNumber } from './submission-lookup.js'

/**
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { PeriodicReport } from '#reports/repository/port.js'
 */

/**
 * @typedef {{ period: number, startDate: string, endDate: string, dueDate: string }} PeriodInfo
 */

/**
 * Throws a 400 Boom with `output.payload.invalidPeriod` if the period isn't
 * in the cadence's valid range for the year.
 *
 * @param {number} period
 * @param {Cadence} cadence
 * @param {PeriodInfo[]} allPeriods
 * @returns {PeriodInfo}
 */
const assertValidPeriod = (period, cadence, allPeriods) => {
  const periodInfo = allPeriods.find((p) => p.period === period)
  if (!periodInfo) {
    const validPeriods = allPeriods.map((p) => p.period)
    throw badRequest(
      `Invalid period ${period} for cadence ${cadence}`,
      errorCodes.invalidPeriod,
      {
        event: {
          action: 'create_report',
          reason: `actual=${period} cadence=${cadence} validPeriods=[${validPeriods.join(',')}]`
        },
        payload: { invalidPeriod: { actual: period, cadence, validPeriods } }
      }
    )
  }
  return periodInfo
}

/**
 * Throws a 400 Boom with `output.payload.periodNotEnded` if the period's
 * end date has not yet passed.
 *
 * @param {PeriodInfo} periodInfo
 * @param {number} period
 * @param {Cadence} cadence
 * @returns {void}
 */
const assertPeriodEnded = (periodInfo, period, cadence) => {
  const dayAfterEnd = new Date(periodInfo.endDate)
  dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
  if (dayAfterEnd > new Date()) {
    const earliestSubmissionDate = dayAfterEnd.toISOString()
    throw badRequest(
      `Cannot create report for period ${period} — period has not yet ended`,
      errorCodes.periodNotEnded,
      {
        event: {
          action: 'create_report',
          reason: `period=${period} cadence=${cadence} endDate=${periodInfo.endDate} earliestSubmissionDate=${earliestSubmissionDate}`
        },
        payload: {
          periodNotEnded: {
            period,
            cadence,
            endDate: periodInfo.endDate,
            earliestSubmissionDate
          }
        }
      }
    )
  }
}

/**
 * Throws a 409 Boom with `output.payload.existingReport` if a report for the
 * same period already exists.
 *
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @returns {void}
 */
export const assertNoExistingReport = (
  periodicReports,
  year,
  cadence,
  period,
  submissionNumber
) => {
  const id = findSubmissionByNumber(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber
  )?.id
  if (id) {
    throw conflict(
      `Report already exists for ${cadence} period ${period} of ${year}`,
      errorCodes.reportAlreadyExists,
      {
        event: {
          action: 'create_report',
          reason: `cadence=${cadence} period=${period} year=${year}`,
          reference: id
        },
        payload: { existingReport: { id, cadence, period, year } }
      }
    )
  }
}

/**
 * Throws a 409 Boom when creating a resubmission (submissionNumber > 1) is not
 * allowed. A resubmission requires the closed-period-adjustments feature flag
 * to be on and the previous submission to be a submitted report flagged as
 * requiring resubmission. The flag is checked first, then the block rule; each
 * failure carries a distinct `reason` so the frontend can tell them apart from
 * the duplicate-period conflict.
 *
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {void}
 */
export const assertResubmissionAllowed = (
  periodicReports,
  year,
  cadence,
  period,
  submissionNumber
) => {
  if (submissionNumber <= 1) {
    return
  }

  const reject = (reason) =>
    conflict(
      `Resubmission ${submissionNumber} not permitted for ${cadence} period ${period} of ${year}`,
      reason,
      {
        event: {
          action: 'create_report',
          reason: `cadence=${cadence} period=${period} year=${year} submissionNumber=${submissionNumber} rejected=${reason}`
        },
        payload: { reason }
      }
    )

  if (!isClosedPeriodAdjustmentsEnabled()) {
    throw reject(errorCodes.resubmissionFeatureDisabled)
  }

  const previous = findSubmissionByNumber(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber - 1
  )
  const permitted =
    previous?.status === REPORT_STATUS.SUBMITTED &&
    isResubmissionRequired(previous?.resubmissionRequired)
  if (!permitted) {
    throw reject(errorCodes.resubmissionNotPermitted)
  }
}

/**
 * Validates that a period exists for the given cadence and has ended.
 * @param {Cadence} cadence
 * @param {number} year
 * @param {number} period
 * @returns {{ startDate: string, endDate: string, dueDate: string }}
 */
export function getValidatedPeriodInfo(cadence, year, period) {
  const allPeriods = generateAllPeriodsForYear(cadence, year)
  const periodInfo = assertValidPeriod(period, cadence, allPeriods)
  assertPeriodEnded(periodInfo, period, cadence)
  return periodInfo
}
