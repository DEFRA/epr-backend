import Boom from '@hapi/boom'
import { conflict } from '#common/helpers/logging/cdp-boom.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import {
  validateCreateReport,
  validateDeleteReportParams,
  validateFindPeriodicReports,
  validateFindReportById,
  validateMarkActiveReportsStale,
  validateMarkSubmittedReportsRequiringResubmission,
  validateUpdateReport,
  validateUpdateReportStatus
} from './validation.js'
import {
  transformToPeriodicReports,
  groupAsPeriodicReports,
  latestSubmissionPerPeriod,
  prepareCreateReportParams
} from '#root/reports/repository/helpers.js'
import {
  REPORT_STATUS,
  ACTIVE_REPORT_STATUSES
} from '#root/reports/domain/report-status.js'
import { STALE_REASON } from '#root/reports/domain/stale.js'
import { RESUBMISSION_REASON } from '#root/reports/domain/resubmission.js'

/**
 * @import {
 *   CreateReportParams,
 *   DeleteReportParams,
 *   FindPeriodicReportsParams,
 *   MarkSubmittedReportRequiringResubmissionResult,
 *   MarkSubmittedReportsRequiringResubmissionParams,
 *   PeriodicReport,
 *   Report,
 *   ReportsRepositoryFactory,
 *   UpdateReportParams,
 *   UpdateReportStatusParams
 * } from './port.js'
 * @import { Collection, Db } from 'mongodb'
 */

const REPORTS_COLLECTION = 'reports'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * @param {Db} db
 * @returns {Collection<Report>}
 */
const reportsCollection = (db) =>
  /** @type {Collection<Report>} */ (db.collection(REPORTS_COLLECTION))

/**
 * Resolves a failed findOneAndUpdate into a 404 (report missing) or 409 (version mismatch).
 *
 * @param {Db} db
 * @param {string} reportId
 * @param {number} version
 * @returns {Promise<never>}
 * @throws {Boom.Payload} 404 Not Found if the report does not exist.
 * @throws {Boom.Payload} 409 Conflict if the version numbers do not match.
 */
const throwNotFoundOrConflict = async (db, reportId, version) => {
  const existing = await reportsCollection(db).findOne(
    { id: reportId },
    { projection: { _id: 0, version: 1 } }
  )
  if (!existing) {
    throw Boom.notFound(`Report not found: ${reportId}`)
  }
  throw Boom.conflict(
    `Version conflict: expected version ${version} for report ${reportId}`
  )
}

/**
 * Ensures the reports collection exists with required indexes.
 * Safe to call multiple times — MongoDB createIndex is idempotent.
 *
 * @param {Db} db
 * @returns {Promise<void>}
 */
async function ensureCollections(db) {
  const col = reportsCollection(db)

  await col.createIndex({ id: 1 }, { unique: true })
  await col.createIndex({ organisationId: 1, registrationId: 1 })
  await col.createIndex(
    {
      organisationId: 1,
      registrationId: 1,
      year: 1,
      cadence: 1,
      period: 1,
      submissionNumber: 1
    },
    { unique: true }
  )
  await col.createIndex(
    { organisationId: 1, registrationId: 1, year: 1, cadence: 1, period: 1 },
    {
      unique: true,
      partialFilterExpression: {
        'status.currentStatus': {
          $in: [REPORT_STATUS.IN_PROGRESS, REPORT_STATUS.READY_TO_SUBMIT]
        }
      },
      name: 'reports_one_active_draft_per_period'
    }
  )
}

/**
 * @param {Db} db
 * @param {CreateReportParams} params
 * @returns {Promise<Report>}
 * */
const performCreateReport = async (db, params) => {
  const validated = validateCreateReport(params)
  const { cadence, period, submissionNumber } = validated
  const report = prepareCreateReportParams(validated)

  try {
    await reportsCollection(db).insertOne({ ...report })
  } catch (error) {
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throw conflict(
        `An active report already exists for cadence ${cadence} and period ${period}`,
        errorCodes.reportAlreadyExists,
        {
          event: {
            action: 'create_report',
            reason: `cadence=${cadence} period=${period} submissionNumber=${submissionNumber}`
          }
        }
      )
    }
    throw error
  }

  return report
}

/**
 * @param {Db} db
 * @param {UpdateReportParams} params
 * @returns {Promise<Report>}
 */
const performUpdateReport = async (db, params) => {
  const validated = validateUpdateReport(params)
  const { reportId, version, fields } = validated

  /** @type {Record<string, unknown>} */
  const setFields = {}

  if (fields.supportingInformation !== undefined) {
    setFields.supportingInformation = fields.supportingInformation
  }

  if (fields.prn !== undefined) {
    setFields.prn = fields.prn
  }

  if (fields.recyclingActivity !== undefined) {
    setFields.recyclingActivity = fields.recyclingActivity
  }

  if (fields.exportActivity !== undefined) {
    for (const [key, value] of Object.entries(fields.exportActivity)) {
      setFields[`exportActivity.${key}`] = value
    }
  }

  const doc = await reportsCollection(db).findOneAndUpdate(
    { id: reportId, version },
    { $set: setFields, $inc: { version: 1 } },
    { returnDocument: 'after', projection: { _id: 0 } }
  )

  if (!doc) {
    return throwNotFoundOrConflict(db, reportId, version)
  }

  const { _id, ...report } = doc
  return report
}

/**
 * @param {Db} db
 * @param {UpdateReportStatusParams} params
 * @returns {Promise<Report>}
 */
const performUpdateReportStatus = async (db, params) => {
  const { slot, ...statusParams } = params
  const { reportId, version, status, changedBy, submissionDeclaredBy } =
    validateUpdateReportStatus(statusParams)

  const now = new Date().toISOString()
  const slotValue =
    submissionDeclaredBy === undefined
      ? { at: now, by: changedBy }
      : { at: now, by: changedBy, declaredBy: submissionDeclaredBy }

  const doc = await reportsCollection(db).findOneAndUpdate(
    { id: reportId, version },
    {
      $set: {
        'status.currentStatus': status,
        'status.currentStatusAt': now,
        [`status.${slot}`]: slotValue
      },
      $push: /** @type {any} */ ({
        'status.history': { status, at: now, by: changedBy }
      }),
      $inc: { version: 1 }
    },
    { returnDocument: 'after', projection: { _id: 0 } }
  )

  if (!doc) {
    return throwNotFoundOrConflict(db, reportId, version)
  }

  const { _id, ...report } = doc
  return report
}

/**
 * @param {Db} db
 * @param {string} reportId
 * @returns {Promise<Report>}
 */
const performFindReportById = async (db, reportId) => {
  const validatedId = validateFindReportById(reportId)
  const doc = await reportsCollection(db).findOne({ id: validatedId })
  if (!doc) {
    throw Boom.notFound(`Report not found: ${reportId}`)
  }
  const { _id, ...report } = doc
  return report
}

/**
 * Hard-deletes the report identified by the given period slot and submissionNumber.
 *
 * @param {Db} db
 * @param {DeleteReportParams} params
 * @returns {Promise<void>}
 */
const performDeleteReport = async (db, params) => {
  const validated = validateDeleteReportParams(params)
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber
  } = validated

  const result = await reportsCollection(db).findOneAndDelete({
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber
  })

  if (!result) {
    throw Boom.notFound(
      `No report found for cadence ${cadence} and period ${period}`
    )
  }
}

/**
 * @param {Db} db
 * @param {FindPeriodicReportsParams} params
 * @returns {Promise<PeriodicReport[]>}
 */
const performFindPeriodicReports = async (db, params) => {
  const { organisationId, registrationId } = validateFindPeriodicReports(params)

  const docs = await reportsCollection(db)
    .find(
      { organisationId, registrationId },
      {
        projection: {
          _id: 0,
          id: 1,
          submissionNumber: 1,
          year: 1,
          cadence: 1,
          period: 1,
          startDate: 1,
          endDate: 1,
          dueDate: 1,
          'status.currentStatus': 1,
          'status.created': 1,
          'status.submitted': 1,
          resubmissionRequired: 1
        }
      }
    )
    .toArray()

  return groupAsPeriodicReports(organisationId, registrationId, docs)
}

/**
 * Returns all periodic reports across every org/registration, with
 * submittedAt/submittedBy embedded in each ReportSummary.
 *
 * @param {Db} db
 * @returns {Promise<PeriodicReport[]>}
 */
const performFindAllPeriodicReports = async (db) => {
  const docs = await reportsCollection(db)
    .find(
      {},
      {
        projection: {
          _id: 0,
          id: 1,
          submissionNumber: 1,
          year: 1,
          cadence: 1,
          period: 1,
          startDate: 1,
          endDate: 1,
          dueDate: 1,
          organisationId: 1,
          registrationId: 1,
          'status.currentStatus': 1,
          'status.created': 1,
          'status.submitted': 1,
          resubmissionRequired: 1,
          'recyclingActivity.totalTonnageReceived': 1,
          'recyclingActivity.tonnageRecycled': 1,
          'recyclingActivity.tonnageNotRecycled': 1,
          'exportActivity.totalTonnageExported': 1,
          'exportActivity.tonnageReceivedNotExported': 1,
          'exportActivity.tonnageRefusedAtDestination': 1,
          'exportActivity.tonnageStoppedDuringExport': 1,
          'exportActivity.tonnageRepatriated': 1,
          'wasteSent.tonnageSentToReprocessor': 1,
          'wasteSent.tonnageSentToExporter': 1,
          'wasteSent.tonnageSentToAnotherSite': 1,
          'prn.issuedTonnage': 1,
          'prn.freeTonnage': 1,
          'prn.totalRevenue': 1,
          'prn.averagePricePerTonne': 1,
          supportingInformation: 1
        }
      }
    )
    .toArray()

  return transformToPeriodicReports(docs)
}

/**
 * Atomically flags the reports matched by `selectFilter` with a summary-log
 * marker, then returns the flagged reports (sans marker) for auditing. The
 * `$ne` guards plus the modifiedCount gate make a redelivered or concurrent
 * submit of the same log a no-op (no double-flag, version over-increment, or
 * duplicate audit). The stale and resubmission marks differ only in how they
 * select candidate reports.
 *
 * @param {Db} db
 * @param {{
 *   selectFilter: object,
 *   readScope: object,
 *   summaryLogId: string,
 *   field: string,
 *   value: object
 * }} params
 * @returns {Promise<Array<{ reportId: string, year: number, cadence: string, period: number, submissionNumber: number }>>}
 */
const flagReportsBySummaryLog = async (
  db,
  { selectFilter, readScope, summaryLogId, field, value }
) => {
  const { modifiedCount } = await reportsCollection(db).updateMany(
    {
      ...selectFilter,
      [`${field}.summaryLogId`]: { $ne: summaryLogId },
      'source.summaryLogId': { $ne: summaryLogId }
    },
    { $set: { [field]: value }, $inc: { version: 1 } }
  )

  if (modifiedCount === 0) {
    return []
  }

  const flaggedDocs = await reportsCollection(db)
    .find(
      { ...readScope, [`${field}.summaryLogId`]: summaryLogId },
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
 * Skips reports already stale from this SL (retry-safe) and reports built from it (already current).
 *
 * @param {Db} db
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {string} summaryLogId
 * @param {string} uploadedAt
 * @returns {Promise<import('./port.js').MarkReportStaleResult[]>}
 */
const performMarkActiveReportsStale = async (
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

  const stale = {
    uploadedAt,
    reason: STALE_REASON.SUMMARY_LOG_CHANGED,
    summaryLogId
  }

  const flagged = await flagReportsBySummaryLog(db, {
    selectFilter: {
      organisationId,
      registrationId,
      'status.currentStatus': { $in: [...ACTIVE_REPORT_STATUSES] }
    },
    readScope: { organisationId, registrationId },
    summaryLogId,
    field: 'stale',
    value: stale
  })

  return flagged.map((report) => ({ ...report, stale }))
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
const performMarkSubmittedReportsRequiringResubmission = async (
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

  const resubmissionRequired = {
    uploadedAt,
    reason: RESUBMISSION_REASON.CLOSED_PERIOD_RESTATED,
    summaryLogId
  }

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
  const flagged = await flagReportsBySummaryLog(db, {
    selectFilter: scope,
    readScope: scope,
    summaryLogId,
    field: 'resubmissionRequired',
    value: resubmissionRequired
  })

  return flagged.map((report) => ({ ...report, resubmissionRequired }))
}

/**
 * Returns true when any report for the org/reg was submitted strictly after
 * `since`. SUBMITTED is terminal and each submission is a distinct document, so
 * the denormalised `status.submitted` slot is the single submission instant and
 * is directly indexable.
 *
 * @param {Db} db
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {string} since - ISO timestamp
 * @returns {Promise<boolean>}
 */
const performHasReportSubmittedSince = async (
  db,
  organisationId,
  registrationId,
  since
) => {
  // Both `at` and `since` are canonical `new Date().toISOString()` values, so the
  // `$gt` string compare tracks chronological order (the ISO invariant this
  // codebase relies on throughout).
  const match = await reportsCollection(db).findOne(
    {
      organisationId,
      registrationId,
      'status.submitted.at': { $gt: since }
    },
    { projection: { _id: 1 } }
  )
  return match !== null
}

/**
 * Creates a MongoDB-backed reports repository.
 *
 * @param {Db} db
 * @returns {Promise<ReportsRepositoryFactory>}
 */
export const createReportsRepository = async (db) => {
  await ensureCollections(db)

  return () => ({
    createReport: (params) => performCreateReport(db, params),
    updateReport: (params) => performUpdateReport(db, params),
    updateReportStatus: (params) => performUpdateReportStatus(db, params),
    deleteReport: (params) => performDeleteReport(db, params),
    findPeriodicReports: (params) => performFindPeriodicReports(db, params),
    findAllPeriodicReports: () => performFindAllPeriodicReports(db),
    findReportById: (reportId) => performFindReportById(db, reportId),
    markActiveReportsStale: (
      organisationId,
      registrationId,
      summaryLogId,
      uploadedAt
    ) =>
      performMarkActiveReportsStale(
        db,
        organisationId,
        registrationId,
        summaryLogId,
        uploadedAt
      ),
    markSubmittedReportsRequiringResubmission: (params) =>
      performMarkSubmittedReportsRequiringResubmission(db, params),
    hasReportSubmittedSince: (organisationId, registrationId, since) =>
      performHasReportSubmittedSince(db, organisationId, registrationId, since)
  })
}
