import {
  validateMarkActiveReportsStale,
  validateMarkActiveReportsStaleForPrnCancellation,
  validateMarkSubmittedReportsRequiringResubmission,
  validateMarkSubmittedReportRequiringResubmissionByOperator
} from './validation.js'
import { latestSubmissionPerPeriod } from '#root/reports/repository/helpers.js'
import {
  REPORT_STATUS,
  ACTIVE_REPORT_STATUSES
} from '#root/reports/domain/report-status.js'
import { reportsCollection } from './mongodb-collection.js'

/**
 * @import {
 *   MarkSubmittedReportRequiringResubmissionResult,
 *   MarkSubmittedReportsRequiringResubmissionParams
 * } from './port.js'
 * @import { Db } from 'mongodb'
 */

/**
 * Atomically flags the reports matched by `selectFilter` with a marker at
 * `field` (a dot-path, e.g. `stale.summaryLogChanged`), then returns the
 * flagged reports (sans marker) for auditing. The `$ne` guard plus the
 * modifiedCount gate make a redelivered or concurrent trigger a no-op (no
 * double-flag, version over-increment, or duplicate audit). `field` is always
 * a nested path under a container field (`stale`, `resubmissionRequired`), so
 * the `$set` only ever touches that one named field — a sibling trigger's
 * marker on the same container is untouched.
 *
 * @param {Db} db
 * @param {{
 *   selectFilter: object,
 *   readScope: object,
 *   idempotencyKeyField: string,
 *   idempotencyKeyValue: string,
 *   field: string,
 *   value: object
 * }} params
 * @returns {Promise<Array<{ reportId: string, year: number, cadence: string, period: number, submissionNumber: number }>>}
 */
const flagReportsByIdempotencyKey = async (
  db,
  {
    selectFilter,
    readScope,
    idempotencyKeyField,
    idempotencyKeyValue,
    field,
    value
  }
) => {
  const { modifiedCount } = await reportsCollection(db).updateMany(
    {
      ...selectFilter,
      [`${field}.${idempotencyKeyField}`]: { $ne: idempotencyKeyValue }
    },
    { $set: { [field]: value }, $inc: { version: 1 } }
  )

  if (modifiedCount === 0) {
    return []
  }

  const flaggedDocs = await reportsCollection(db)
    .find(
      {
        ...readScope,
        [`${field}.${idempotencyKeyField}`]: idempotencyKeyValue
      },
      {
        projection: {
          _id: 0,
          id: 1,
          year: 1,
          cadence: 1,
          period: 1,
          submissionNumber: 1
        }
      }
    )
    .toArray()

  return flaggedDocs.map((doc) => ({
    reportId: doc.id,
    year: doc.year,
    cadence: doc.cadence,
    period: doc.period,
    submissionNumber: doc.submissionNumber
  }))
}

/**
 * Bulk-marks all active reports not sourced from `summaryLogId` as stale.
 * Skips reports already stale from this SL (retry-safe), and reports already
 * flagged stale by an earlier upload (first trigger wins; the audit trail records every occurrence).
 *
 * @param {Db} db
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {string} summaryLogId
 * @param {string} uploadedAt
 * @returns {Promise<import('./port.js').MarkReportStaleResult[]>}
 */
export const performMarkActiveReportsStaleForSummaryLog = async (
  db,
  organisationId,
  registrationId,
  summaryLogId,
  uploadedAt
) => {
  validateMarkActiveReportsStale({
    organisationId,
    registrationId,
    summaryLogId,
    uploadedAt
  })

  const summaryLogChanged = { uploadedAt, summaryLogId }

  const flagged = await flagReportsByIdempotencyKey(db, {
    selectFilter: {
      organisationId,
      registrationId,
      'status.currentStatus': { $in: [...ACTIVE_REPORT_STATUSES] },
      'source.summaryLogId': { $ne: summaryLogId },
      'stale.summaryLogChanged': { $exists: false }
    },
    readScope: { organisationId, registrationId },
    idempotencyKeyField: 'summaryLogId',
    idempotencyKeyValue: summaryLogId,
    field: 'stale.summaryLogChanged',
    value: summaryLogChanged
  })

  return flagged.map((report) => ({
    ...report,
    stale: { summaryLogChanged }
  }))
}

/**
 * Marks the active (in_progress / ready_to_submit) report for the given
 * org/reg/period as stale for a PRN cancellation. Skips it if already
 * flagged, whether by this `prnId` (retry-safe) or another one (first
 * cancellation wins; the audit trail records every occurrence).
 *
 * @param {Db} db
 * @param {import('./port.js').MarkActiveReportsStaleForPrnCancellationParams} params
 * @returns {Promise<import('./port.js').MarkReportStaleResult[]>}
 */
export const performMarkActiveReportsStaleForPrnCancellation = async (
  db,
  params
) => {
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    prnId,
    occurredAt
  } = validateMarkActiveReportsStaleForPrnCancellation(params)

  const prnCancelled = { occurredAt, prnId }

  const flagged = await flagReportsByIdempotencyKey(db, {
    selectFilter: {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      'status.currentStatus': { $in: [...ACTIVE_REPORT_STATUSES] },
      'stale.prnCancelled': { $exists: false }
    },
    readScope: { organisationId, registrationId, year, cadence, period },
    idempotencyKeyField: 'prnId',
    idempotencyKeyValue: prnId,
    field: 'stale.prnCancelled',
    value: prnCancelled
  })

  return flagged.map((report) => ({
    ...report,
    stale: { prnCancelled }
  }))
}

/**
 * For each given period, flags the latest submitted report as requiring
 * resubmission. Skips a period whose latest submitted report is already flagged
 * from this `summaryLogId` or was itself built from it (retry-safe).
 *
 * @param {Db} db
 * @param {MarkSubmittedReportsRequiringResubmissionParams} params
 * @returns {Promise<MarkSubmittedReportRequiringResubmissionResult[]>}
 */
export const performMarkSubmittedReportsRequiringResubmission = async (
  db,
  { organisationId, registrationId, summaryLogId, uploadedAt, periods }
) => {
  validateMarkSubmittedReportsRequiringResubmission({
    organisationId,
    registrationId,
    summaryLogId,
    uploadedAt,
    periods
  })

  if (periods.length === 0) {
    return []
  }

  const closedPeriodRestated = { uploadedAt, summaryLogId }

  const submitted = await reportsCollection(db)
    .find(
      {
        organisationId,
        registrationId,
        'status.currentStatus': REPORT_STATUS.SUBMITTED,
        $or: periods.map(({ year, cadence, period }) => ({
          year,
          cadence,
          period
        }))
      },
      {
        projection: {
          _id: 0,
          id: 1,
          year: 1,
          cadence: 1,
          period: 1,
          submissionNumber: 1
        }
      }
    )
    .toArray()

  const flaggedIds = latestSubmissionPerPeriod(submitted).map((doc) => doc.id)

  if (flaggedIds.length === 0) {
    return []
  }

  const scope = { id: { $in: flaggedIds } }
  const flagged = await flagReportsByIdempotencyKey(db, {
    selectFilter: scope,
    readScope: scope,
    idempotencyKeyField: 'summaryLogId',
    idempotencyKeyValue: summaryLogId,
    field: 'resubmissionRequired.closedPeriodRestated',
    value: closedPeriodRestated
  })

  return flagged.map((report) => ({
    ...report,
    resubmissionRequired: { closedPeriodRestated }
  }))
}

/**
 * Flags the exact report identified by `submissionNumber` as requiring
 * resubmission at the operator's own request. Returns `null` when nothing
 * matched (the caller checks eligibility immediately before calling this).
 *
 * @param {Db} db
 * @param {import('./port.js').MarkSubmittedReportRequiringResubmissionByOperatorParams} params
 * @returns {Promise<import('./port.js').MarkSubmittedReportRequiringResubmissionByOperatorFlaggedResult | null>}
 */
export const performMarkSubmittedReportRequiringResubmissionByOperator = async (
  db,
  params
) => {
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber,
    requestedBy,
    requestedAt
  } = validateMarkSubmittedReportRequiringResubmissionByOperator(params)

  const operatorRequested = { requestedAt, requestedBy }

  const doc = await reportsCollection(db).findOneAndUpdate(
    {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber,
      'status.currentStatus': REPORT_STATUS.SUBMITTED,
      'resubmissionRequired.operatorRequested': { $exists: false }
    },
    {
      $set: { 'resubmissionRequired.operatorRequested': operatorRequested },
      $inc: { version: 1 }
    },
    {
      returnDocument: 'after',
      projection: {
        _id: 0,
        id: 1,
        year: 1,
        cadence: 1,
        period: 1,
        submissionNumber: 1,
        resubmissionRequired: 1
      }
    }
  )

  if (!doc) {
    return null
  }

  return {
    reportId: doc.id,
    year: doc.year,
    cadence: doc.cadence,
    period: doc.period,
    submissionNumber: doc.submissionNumber,
    resubmissionRequired: {
      ...doc.resubmissionRequired,
      operatorRequested
    }
  }
}
