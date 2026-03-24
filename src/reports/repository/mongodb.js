import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { logger } from '#common/helpers/logging/logger.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  validateCreateReport,
  validateDeleteReportParams,
  validateFindPeriodicReports,
  validateFindReportById,
  validateUpdateReport
} from './validation.js'

const REPORTS_COLLECTION = 'reports'
const PERIODIC_REPORTS_COLLECTION = 'periodic-reports'

/**
 * Ensures both collections exist with required indexes.
 * Safe to call multiple times — MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<void>}
 */
async function ensureCollections(db) {
  await db
    .collection(PERIODIC_REPORTS_COLLECTION)
    .createIndex(
      { organisationId: 1, registrationId: 1, year: 1 },
      { unique: true }
    )

  await db
    .collection(REPORTS_COLLECTION)
    .createIndex({ id: 1 }, { unique: true })
  await db.collection(REPORTS_COLLECTION).createIndex({ status: 1 })
}

/**
 * Maps a MongoDB periodic-report document to the domain shape, stripping the internal _id.
 *
 * @param {Object} doc
 * @returns {import('./port.js').PeriodicReport}
 */
const toPeriodicDomain = (doc) => {
  const { _id, ...fields } = doc
  return /** @type {import('./port.js').PeriodicReport} */ (
    structuredClone(fields)
  )
}

/**
 * Fetches a single periodic-report slot.
 *
 * @param {import('mongodb').Db} db
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {number} year
 * @param {string} cadence
 * @param {number} period
 * @returns {Promise<import('./port.js').ReportPerPeriod|undefined>}
 */
const fetchSlot = async (
  db,
  organisationId,
  registrationId,
  year,
  cadence,
  period
) => {
  const slotField = `reports.${cadence}.${period}`
  const doc = await db
    .collection(PERIODIC_REPORTS_COLLECTION)
    .findOne(
      { organisationId, registrationId, year },
      { projection: { [slotField]: 1 } }
    )
  return doc?.reports?.[cadence]?.[period]
}

/**
 * Upserts the periodic-reports slot for a new report, archiving any existing currentReportId.
 *
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').UpsertSlotParams} params
 * @returns {Promise<void>}
 */
const upsertPeriodicReportSlot = async (db, params) => {
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    newReportId,
    startDate,
    endDate,
    dueDate
  } = params
  const slotPath = `reports.${cadence}.${period}`
  const existingCurrentReportId = `$${slotPath}.currentReportId`

  await db.collection(PERIODIC_REPORTS_COLLECTION).updateOne(
    { organisationId, registrationId, year },
    [
      {
        $set: {
          version: { $add: [{ $ifNull: ['$version', 0] }, 1] },
          [`${slotPath}.currentReportId`]: newReportId,
          [`${slotPath}.startDate`]: startDate,
          [`${slotPath}.endDate`]: endDate,
          [`${slotPath}.dueDate`]: dueDate,
          [`${slotPath}.previousReportIds`]: {
            $cond: {
              if: { $ne: [{ $ifNull: [existingCurrentReportId, null] }, null] },
              then: {
                $concatArrays: [
                  { $ifNull: [`$${slotPath}.previousReportIds`, []] },
                  [existingCurrentReportId]
                ]
              },
              else: { $ifNull: [`$${slotPath}.previousReportIds`, []] }
            }
          }
        }
      }
    ],
    { upsert: true }
  )
}

/**
 * Clears the currentReportId on a slot, archiving it into previousReportIds.
 * Uses an aggregation pipeline update to avoid a prior read.
 *
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').ReportPerPeriodKey} params
 * @returns {Promise<void>}
 */
const clearPeriodicReportSlot = async (db, params) => {
  const { organisationId, registrationId, year, cadence, period } = params
  const slotPath = `reports.${cadence}.${period}`
  await db
    .collection(PERIODIC_REPORTS_COLLECTION)
    .updateOne({ organisationId, registrationId, year }, [
      {
        $set: {
          [`${slotPath}.previousReportIds`]: {
            $concatArrays: [
              `$${slotPath}.previousReportIds`,
              {
                $filter: {
                  input: [`$${slotPath}.currentReportId`],
                  cond: { $ne: ['$$this', null] }
                }
              }
            ]
          },
          [`${slotPath}.currentReportId`]: null,
          version: { $add: ['$version', 1] }
        }
      }
    ])
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').CreateReportParams} params
 * @returns {Promise<import('./port.js').Report>} the created report
 */
const performCreateReport = async (db, params) => {
  const validated = validateCreateReport(params)
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    startDate,
    endDate,
    dueDate,
    changedBy,
    material,
    wasteProcessingType,
    siteAddress,
    recyclingActivity,
    exportActivity,
    wasteSent,
    prnData,
    supportingInformation
  } = validated

  const now = new Date().toISOString()
  const reportId = randomUUID()

  const reportDoc = Object.fromEntries(
    Object.entries({
      id: reportId,
      version: 1,
      schemaVersion: 1,
      status: REPORT_STATUS.IN_PROGRESS,
      statusHistory: [
        { status: REPORT_STATUS.IN_PROGRESS, changedBy, changedAt: now }
      ],
      material,
      wasteProcessingType,
      siteAddress,
      recyclingActivity,
      exportActivity,
      wasteSent,
      prnData,
      supportingInformation
    }).filter(([, v]) => v !== undefined)
  )

  await db.collection(REPORTS_COLLECTION).insertOne(reportDoc)

  await upsertPeriodicReportSlot(db, {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    startDate,
    endDate,
    dueDate,
    newReportId: reportId
  })

  const { _id, ...report } = reportDoc
  return /** @type {import('./port.js').Report} */ (report)
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').UpdateReportParams} params
 * @returns {Promise<void>}
 */
const performUpdateReport = async (db, params) => {
  const validated = validateUpdateReport(params)
  const { reportId, version, fields, changedBy } = validated

  const now = new Date().toISOString()

  const update = {
    $set: { ...fields },
    $inc: { version: 1 }
  }

  if (fields.status) {
    update.$push = {
      statusHistory: { status: fields.status, changedBy, changedAt: now }
    }
  }

  const { matchedCount } = await db
    .collection(REPORTS_COLLECTION)
    .updateOne({ id: reportId, version }, update)

  if (matchedCount === 0) {
    const exists = await db
      .collection(REPORTS_COLLECTION)
      .countDocuments({ id: reportId }, { limit: 1 })
    if (exists === 0) {
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
const performFindReportId = async (db, reportId) => {
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
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').DeleteReportParams} params
 * @returns {Promise<void>}
 */
const performDeleteReport = async (db, params) => {
  const validated = validateDeleteReportParams(params)
  const { organisationId, registrationId, year, cadence, period, changedBy } =
    validated

  const slot = await fetchSlot(
    db,
    organisationId,
    registrationId,
    year,
    cadence,
    period
  )

  if (!slot) {
    throw Boom.notFound(
      `No periodic report found for cadence ${cadence} and period ${period}`
    )
  }

  const { currentReportId } = slot

  if (!currentReportId) {
    throw Boom.notFound(
      `No current report found for cadence ${cadence} and period ${period}`
    )
  }

  const updated = await db.collection(REPORTS_COLLECTION).findOneAndUpdate(
    { id: currentReportId },
    /** @type {any} */ ({
      $set: { status: REPORT_STATUS.DELETED },
      $push: {
        statusHistory: {
          status: REPORT_STATUS.DELETED,
          changedBy,
          changedAt: new Date().toISOString()
        }
      },
      $inc: { version: 1 }
    }),
    { returnDocument: 'after' }
  )

  logger.info(
    {},
    `Report ${currentReportId} deletion, isSuccess = ${updated != null}`
  )

  await clearPeriodicReportSlot(db, {
    organisationId,
    registrationId,
    year,
    cadence,
    period
  })
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').FindPeriodicReportsParams} params
 * @returns {Promise<import('./port.js').PeriodicReport[]>}
 */
const performFindPeriodicReports = async (db, params) => {
  const { organisationId, registrationId } = validateFindPeriodicReports(params)

  const docs = await db
    .collection(PERIODIC_REPORTS_COLLECTION)
    .find({ organisationId, registrationId })
    .toArray()

  return docs.map(toPeriodicDomain)
}

/**
 * @param {import('mongodb').Db} db
 * @param {string[]} reportIds
 * @returns {Promise<Map<string, import('./port.js').ReportStatus>>}
 */
const performFindReportStatusesByIds = async (db, reportIds) => {
  if (reportIds.length === 0) {
    return new Map()
  }

  const docs = await db
    .collection(REPORTS_COLLECTION)
    .find({ id: { $in: reportIds } }, { projection: { id: 1, status: 1 } })
    .toArray()

  return new Map(docs.map((doc) => [doc.id, doc.status]))
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
    deleteReport: (params) => performDeleteReport(db, params),
    findPeriodicReports: (params) => performFindPeriodicReports(db, params),
    findReportById: (reportId) => performFindReportId(db, reportId),
    findReportStatusesByIds: (reportIds) =>
      performFindReportStatusesByIds(db, reportIds)
  })
}
