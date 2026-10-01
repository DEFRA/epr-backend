import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  calculateExpiresAt,
  SUMMARY_LOG_FAILURE_STATUS,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import { buildDownloadDisposition } from './download-disposition.js'
import { parseSummaryLogUri } from './parse-uri.js'
import { normaliseStoredSummaryLog } from './normalise-load-row-ids.js'
import {
  validateId,
  validateSummaryLogInsert,
  validateSummaryLogUpdate
} from './validation.js'

export const COLLECTION_NAME = 'summary-logs'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000
const SUBMITTING_LOCK_INDEX_NAME = 'summary_log_submitting_lock'

const LEGACY_SUBMITTING_LOCK_INDEX_NAME = 'organisationId_1_registrationId_1'
const IGNORABLE_DROP_INDEX_ERRORS = new Set([
  'IndexNotFound',
  'NamespaceNotFound'
])

/**
 * Creates the submitting lock over
 * `organisationId, registrationId, year, accreditationId`, then drops the
 * pre-year-scoping lock by name. Creating first leaves no window without a lock.
 *
 * @param {import('mongodb').Collection} collection
 */
async function ensureSubmittingLockIndex(collection) {
  // Enforces at most one summary log in 'submitting' status per
  // org/reg/year/accreditationId. A legacy document has no `year`, so it
  // indexes as null and still collides with any other legacy document,
  // matching today's org/reg-only behaviour until the backfill assigns one.
  await collection.createIndex(
    { organisationId: 1, registrationId: 1, year: 1, accreditationId: 1 },
    {
      name: SUBMITTING_LOCK_INDEX_NAME,
      unique: true,
      partialFilterExpression: { status: 'submitting' }
    }
  )

  try {
    await collection.dropIndex(LEGACY_SUBMITTING_LOCK_INDEX_NAME)
  } catch (error) {
    if (!IGNORABLE_DROP_INDEX_ERRORS.has(error.codeName)) {
      throw error
    }
  }
}

/**
 * Ensures the collection exists with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('mongodb').Collection>}
 */
async function ensureCollection(db) {
  const collection = db.collection(COLLECTION_NAME)

  await ensureSubmittingLockIndex(collection)

  // TTL index for automatic cleanup of non-submitted summary logs
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  // The waste balance ledger records a submission by its file, so a download
  // reached from the ledger is looked up that way.
  await collection.createIndex({ 'file.id': 1 })

  // Optimises findLatestSubmittedForOrgReg query which filters by
  // org/reg/year/accreditationId/status and sorts by submittedAt descending
  await collection.createIndex({
    organisationId: 1,
    registrationId: 1,
    year: 1,
    accreditationId: 1,
    status: 1,
    submittedAt: -1
  })

  return collection
}

const insert = (db) => async (id, summaryLog) => {
  const validatedId = validateId(id)
  const validatedSummaryLog = validateSummaryLogInsert(summaryLog)

  try {
    await db
      .collection(COLLECTION_NAME)
      .insertOne({ _id: validatedId, version: 1, ...validatedSummaryLog })
  } catch (error) {
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throw Boom.conflict(`Summary log with id ${validatedId} already exists`)
    }
    throw error
  }
}

const update = (db, logger) => async (id, version, updates) => {
  const validatedId = validateId(id)
  const validatedUpdates = validateSummaryLogUpdate(updates)

  /** @type {any} */
  const filter = { _id: validatedId, version }
  const result = await db
    .collection(COLLECTION_NAME)
    .updateOne(filter, { $set: validatedUpdates, $inc: { version: 1 } })

  if (result.matchedCount === 0) {
    /** @type {any} */
    const findFilter = { _id: validatedId }
    const existing = await db.collection(COLLECTION_NAME).findOne(findFilter)

    if (!existing) {
      throw Boom.notFound(`Summary log with id ${validatedId} not found`)
    }

    const conflictError = new Error(
      `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
    )
    logger.error({
      err: conflictError,
      message: `Version conflict detected for summary log ${validatedId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.DB,
        action: LOGGING_EVENT_ACTIONS.VERSION_CONFLICT_DETECTED,
        reference: validatedId
      }
    })
    throw Boom.conflict(conflictError.message)
  }
}

const findById = (db) => async (id) => {
  const validatedId = validateId(id)
  /** @type {any} */
  const findByIdFilter = { _id: validatedId }
  const doc = await db.collection(COLLECTION_NAME).findOne(findByIdFilter)
  if (!doc) {
    return null
  }
  const { _id, version, ...summaryLog } = doc
  return { version, summaryLog: normaliseStoredSummaryLog(summaryLog) }
}

/**
 * A year/accreditation filter that also matches legacy documents (no
 * `year`), so they keep counting for every year and accreditation until the
 * backfill assigns them one. Omitted entirely when the caller doesn't know
 * the year, keeping the registration-wide behaviour untouched.
 *
 * A legacy document has no `year` field at all — insert never writes the key
 * when it isn't supplied — but is matched on `$in: [null]` as well as
 * `$exists: false` because MongoDB stores a JS `undefined` property as BSON
 * `null` rather than omitting it, so either shape must count as legacy.
 *
 * @param {{year?: number, accreditationId?: string | null}} yearAndAccreditation
 * @returns {any}
 */
const yearFilter = ({ year, accreditationId }) =>
  year === undefined
    ? {}
    : {
        $or: [
          { year, accreditationId },
          { year: { $in: [null], $exists: true } },
          { year: { $exists: false } }
        ]
      }

const findLatestSubmittedForOrgReg =
  (db) =>
  /** @param {import('./port.js').SummaryLogScope} scope */
  async ({ organisationId, registrationId, year, accreditationId }) => {
    /** @type {any} */
    const filter = {
      organisationId,
      registrationId,
      status: SUMMARY_LOG_STATUS.SUBMITTED,
      ...yearFilter({ year, accreditationId })
    }

    const doc = await db
      .collection(COLLECTION_NAME)
      .findOne(filter, { sort: { submittedAt: -1 } })

    if (!doc) {
      return null
    }

    const { _id, version, ...summaryLog } = doc
    return {
      id: _id,
      version,
      summaryLog: normaliseStoredSummaryLog(summaryLog)
    }
  }

const findAllByOrgReg = (db) => async (organisationId, registrationId) => {
  const docs = await db
    .collection(COLLECTION_NAME)
    .aggregate([
      {
        $match: {
          organisationId,
          registrationId,
          status: {
            $in: [SUMMARY_LOG_STATUS.SUBMITTED, ...SUMMARY_LOG_FAILURE_STATUS]
          }
        }
      },
      {
        $addFields: {
          _uploadedAt: { $ifNull: ['$submittedAt', '$createdAt'] }
        }
      },
      { $sort: { _uploadedAt: -1 } }
    ])
    .toArray()

  return docs.map((doc) => {
    const { _id, version, _uploadedAt: _u, ...summaryLog } = doc
    return {
      id: _id,
      version,
      summaryLog: normaliseStoredSummaryLog(summaryLog)
    }
  })
}

const findAllSummaryLogStatsByRegistrationId = (db) => async () => {
  const docs = await db
    .collection(COLLECTION_NAME)
    .aggregate([
      {
        $match: {
          status: {
            $in: [SUMMARY_LOG_STATUS.SUBMITTED, ...SUMMARY_LOG_FAILURE_STATUS]
          }
        }
      },
      {
        $group: {
          _id: {
            organisationId: '$organisationId',
            registrationId: '$registrationId'
          },
          lastSuccessful: {
            $max: {
              $cond: [
                { $not: [{ $in: ['$status', SUMMARY_LOG_FAILURE_STATUS] }] },
                '$submittedAt',
                null
              ]
            }
          },
          lastFailed: {
            $max: {
              $cond: [
                { $in: ['$status', SUMMARY_LOG_FAILURE_STATUS] },
                '$createdAt',
                null
              ]
            }
          },
          successfulCount: {
            $sum: {
              $cond: [{ $in: ['$status', SUMMARY_LOG_FAILURE_STATUS] }, 0, 1]
            }
          },
          failedCount: {
            $sum: {
              $cond: [{ $in: ['$status', SUMMARY_LOG_FAILURE_STATUS] }, 1, 0]
            }
          }
        }
      }
    ])
    .toArray()

  return docs.map((doc) => ({
    organisationId: doc._id.organisationId,
    registrationId: doc._id.registrationId,
    lastSuccessful: doc.lastSuccessful ? new Date(doc.lastSuccessful) : null,
    lastFailed: doc.lastFailed ? new Date(doc.lastFailed) : null,
    successfulCount: doc.successfulCount,
    failedCount: doc.failedCount
  }))
}

const transitionToSubmittingExclusive = (db) => async (logId) => {
  const validatedId = validateId(logId)
  const submittedAt = new Date().toISOString()
  const expiresAt = calculateExpiresAt(SUMMARY_LOG_STATUS.SUBMITTING)

  // One conditional write answers every case without a read that could lag
  // behind it: the document as it stood before says whether it existed and
  // whether it was validated, and only a validated document is changed.
  const submitted = {
    status: SUMMARY_LOG_STATUS.SUBMITTING,
    submittedAt,
    expiresAt
  }
  const submitting = { ...submitted, version: { $add: ['$version', 1] } }
  const whenValidated = {
    $cond: [
      { $eq: ['$status', SUMMARY_LOG_STATUS.VALIDATED] },
      { $mergeObjects: ['$$ROOT', submitting] },
      '$$ROOT'
    ]
  }

  /** @type {any} */
  const findFilter = { _id: validatedId }
  let before
  try {
    before = await db
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(findFilter, [{ $replaceWith: whenValidated }], {
        returnDocument: 'before'
      })
  } catch (error) {
    // The unique partial index on (organisationId, registrationId, year,
    // accreditationId) where status='submitting' refuses a second submitting
    // document per org/reg/year/accreditation
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      return { success: false }
    }
    throw error
  }

  if (!before) {
    throw Boom.notFound(`Summary log with id ${validatedId} not found`)
  }

  if (before.status !== SUMMARY_LOG_STATUS.VALIDATED) {
    throw Boom.conflict(
      `Summary log must be validated before submission. Current status: ${before.status}`
    )
  }

  const { _id, version, ...summaryLog } = before
  return {
    success: true,
    summaryLog: normaliseStoredSummaryLog({ ...summaryLog, ...submitted }),
    version: version + 1
  }
}

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */

const XLSX_EXTENSION = 'xlsx'

const signDownload =
  (db, s3Client, preSignedUrlExpiry) =>
  async (filter, reference, registrationNumber) => {
    const doc = await db.collection(COLLECTION_NAME).findOne(filter)

    if (!doc?.file?.uri) {
      throw Boom.notFound('Summary log file not found')
    }

    const { Bucket, Key } = parseSummaryLogUri(doc.file.uri, reference)
    const command = new GetObjectCommand({
      Bucket,
      Key,
      ...(registrationNumber && {
        ResponseContentDisposition: buildDownloadDisposition(
          registrationNumber,
          doc.submittedAt,
          XLSX_EXTENSION
        )
      })
    })
    const url = await getSignedUrl(s3Client, command, {
      expiresIn: preSignedUrlExpiry
    })
    const expiresAt = new Date(
      Date.now() + preSignedUrlExpiry * 1000
    ).toISOString()

    return { url, expiresAt }
  }

const getDownloadUrl =
  (db, s3Client, preSignedUrlExpiry) =>
  async (summaryLogId, registrationNumber) => {
    const validatedId = validateId(summaryLogId)

    return signDownload(db, s3Client, preSignedUrlExpiry)(
      /** @type {any} */ ({ _id: validatedId }),
      validatedId,
      registrationNumber
    )
  }

const getDownloadUrlByFileId =
  (db, s3Client, preSignedUrlExpiry) => async (fileId, registrationNumber) => {
    const validatedId = validateId(fileId)

    return signDownload(db, s3Client, preSignedUrlExpiry)(
      /** @type {any} */ ({ 'file.id': validatedId }),
      validatedId,
      registrationNumber
    )
  }

/**
 * @typedef {Object} SummaryLogsS3Config
 * @property {S3Client} s3Client - AWS S3 client for generating download URLs
 * @property {number} preSignedUrlExpiry - Expiry time in seconds for download URLs
 */

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {SummaryLogsS3Config} s3Config - S3 configuration for download URLs
 * @returns {Promise<import('./port.js').SummaryLogsRepositoryFactory>}
 */
export const createSummaryLogsRepository = async (db, s3Config) => {
  await ensureCollection(db)

  return (logger) => ({
    insert: insert(db),
    update: update(db, logger),
    findById: findById(db),
    findLatestSubmittedForOrgReg: findLatestSubmittedForOrgReg(db),
    findAllByOrgReg: findAllByOrgReg(db),
    findAllSummaryLogStatsByRegistrationId:
      findAllSummaryLogStatsByRegistrationId(db),
    transitionToSubmittingExclusive: transitionToSubmittingExclusive(db),
    getDownloadUrl: getDownloadUrl(
      db,
      s3Config.s3Client,
      s3Config.preSignedUrlExpiry
    ),
    getDownloadUrlByFileId: getDownloadUrlByFileId(
      db,
      s3Config.s3Client,
      s3Config.preSignedUrlExpiry
    )
  })
}
