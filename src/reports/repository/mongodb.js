import Boom from '@hapi/boom'
import {
  validateCreateReport,
  validateDeleteReportParams,
  validateFindPeriodicReports,
  validateFindReportById,
  validateUnsubmitReport,
  validateUpdateReport,
  validateUpdateReportStatus
} from './validation.js'
import {
  transformToPeriodicReports,
  groupAsPeriodicReports,
  prepareCreateReportParams,
  STATUS_TO_SLOT
} from '#root/reports/repository/helpers.js'
import { REPORT_STATUS } from '#root/reports/domain/report-status.js'

/**
 * @import {
 *   CreateReportParams,
 *   DeleteReportParams,
 *   FindPeriodicReportsParams,
 *   PeriodicReport,
 *   Report,
 *   ReportsRepositoryFactory,
 *   UnsubmitReportParams,
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
  const { cadence, period } = validated
  const report = prepareCreateReportParams(validated)

  try {
    await reportsCollection(db).insertOne({ ...report })
  } catch (error) {
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throw Boom.conflict(
        `An active report already exists for cadence ${cadence} and period ${period}`
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
  const validated = validateUpdateReportStatus(params)
  const { reportId, version, status, changedBy } = validated

  const now = new Date().toISOString()
  const slot = STATUS_TO_SLOT[status]

  const doc = await reportsCollection(db).findOneAndUpdate(
    { id: reportId, version },
    {
      $set: {
        'status.currentStatus': status,
        'status.currentStatusAt': now,
        [`status.${slot}`]: { at: now, by: changedBy }
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
          'status.submitted': 1
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
 * @param {Db} db
 * @param {UnsubmitReportParams} params
 * @returns {Promise<Report>}
 */
const performUnsubmitReport = async (db, params) => {
  const { reportId, version, changedBy } = validateUnsubmitReport(params)
  const now = new Date().toISOString()

  const doc = await reportsCollection(db).findOneAndUpdate(
    { id: reportId, version },
    {
      $set: {
        'status.currentStatus': REPORT_STATUS.READY_TO_SUBMIT,
        'status.currentStatusAt': now,
        'status.unsubmitted': { at: now, by: changedBy }
      },
      $push: /** @type {any} */ ({
        'status.history': {
          status: REPORT_STATUS.READY_TO_SUBMIT,
          at: now,
          by: changedBy
        }
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
    unsubmitReport: (params) => performUnsubmitReport(db, params),
    deleteReport: (params) => performDeleteReport(db, params),
    findPeriodicReports: (params) => performFindPeriodicReports(db, params),
    findAllPeriodicReports: () => performFindAllPeriodicReports(db),
    findReportById: (reportId) => performFindReportById(db, reportId)
  })
}
