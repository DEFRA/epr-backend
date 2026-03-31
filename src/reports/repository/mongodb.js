import Boom from '@hapi/boom'
import {
  validateCreateReport,
  validateDeleteReportParams,
  validateFindPeriodicReports,
  validateFindReportById,
  validateUpdateReport,
  validateUpdateReportStatus
} from './validation.js'
import {
  groupAsPeriodicReports,
  prepareCreateReportParams,
  STATUS_TO_SLOT
} from '#root/reports/repository/helpers.js'
import { REPORT_STATUS } from '#root/reports/domain/report-status.js'

const REPORTS_COLLECTION = 'reports'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * Ensures the reports collection exists with required indexes.
 * Safe to call multiple times — MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<void>}
 */
async function ensureCollections(db) {
  const col = db.collection(REPORTS_COLLECTION)

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
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').CreateReportParams} params
 * @returns {Promise<import('./port.js').Report>}
 * */
const performCreateReport = async (db, params) => {
  const validated = validateCreateReport(params)
  const { cadence, period } = validated
  const reportDoc = prepareCreateReportParams(validated)

  try {
    await db.collection(REPORTS_COLLECTION).insertOne(reportDoc)
  } catch (error) {
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throw Boom.conflict(
        `An active report already exists for cadence ${cadence} and period ${period}`
      )
    }
    throw error
  }

  const { _id, ...report } =
    /** @type {import('./port.js').Report & { _id?: unknown }} */ (reportDoc)

  return report
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').UpdateReportParams} params
 * @returns {Promise<void>}
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

  const { matchedCount } = await db
    .collection(REPORTS_COLLECTION)
    .updateOne(
      { id: reportId, version },
      { $set: setFields, $inc: { version: 1 } }
    )

  if (matchedCount === 0) {
    const doc = await db
      .collection(REPORTS_COLLECTION)
      .findOne({ id: reportId }, { projection: { _id: 0, version: 1 } })
    if (!doc) {
      throw Boom.notFound(`Report not found: ${reportId}`)
    }
    throw Boom.conflict(
      `Version conflict: expected version ${version} for report ${reportId}`
    )
  }
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').UpdateReportStatusParams} params
 * @returns {Promise<void>}
 */
const performUpdateReportStatus = async (db, params) => {
  const validated = validateUpdateReportStatus(params)
  const { reportId, version, status, changedBy } = validated

  const now = new Date().toISOString()
  const slot = STATUS_TO_SLOT[status]

  const { matchedCount } = await db.collection(REPORTS_COLLECTION).updateOne(
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
    }
  )

  if (matchedCount === 0) {
    const doc = await db
      .collection(REPORTS_COLLECTION)
      .findOne({ id: reportId }, { projection: { _id: 0, version: 1 } })
    if (!doc) {
      throw Boom.notFound(`Report not found: ${reportId}`)
    }
    throw Boom.conflict(
      `Version conflict: expected version ${version} for report ${reportId}`
    )
  }
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} reportId
 * @returns {Promise<import('./port.js').Report>}
 */
const performFindReportById = async (db, reportId) => {
  const validatedId = validateFindReportById(reportId)
  const doc = await db
    .collection(REPORTS_COLLECTION)
    .findOne({ id: validatedId })
  if (!doc) {
    throw Boom.notFound(`Report not found: ${reportId}`)
  }
  const { _id, ...report } = doc
  return /** @type {import('./port.js').Report} */ (report)
}

/**
 * Hard-deletes the report identified by the given period slot and submissionNumber.
 *
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').DeleteReportParams} params
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

  const result = await db.collection(REPORTS_COLLECTION).findOneAndDelete({
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
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').FindPeriodicReportsParams} params
 * @returns {Promise<import('./port.js').PeriodicReport[]>}
 */
const performFindPeriodicReports = async (db, params) => {
  const { organisationId, registrationId } = validateFindPeriodicReports(params)

  const docs = await db
    .collection(REPORTS_COLLECTION)
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
          'status.created': 1
        }
      }
    )
    .toArray()

  return groupAsPeriodicReports(organisationId, registrationId, docs)
}

/**
 * Creates a MongoDB-backed reports repository.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('./port.js').ReportsRepositoryFactory>}
 */
export const createReportsRepository = async (db) => {
  await ensureCollections(db)

  return () => ({
    createReport: (params) => performCreateReport(db, params),
    updateReport: (params) => performUpdateReport(db, params),
    updateReportStatus: (params) => performUpdateReportStatus(db, params),
    deleteReport: (params) => performDeleteReport(db, params),
    findPeriodicReports: (params) => performFindPeriodicReports(db, params),
    findReportById: (reportId) => performFindReportById(db, reportId)
  })
}
