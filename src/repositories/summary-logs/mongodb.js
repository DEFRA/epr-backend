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
import { keyedBy } from './natural-keys.js'
import {
  validateId,
  validateSummaryLogInsert,
  validateSummaryLogKey,
  validateSummaryLogNumbers,
  validateSummaryLogUpdate
} from './validation.js'

export const COLLECTION_NAME = 'summary-logs'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000
const SUBMITTING_LOCK_INDEX_NAME = 'summary_log_submitting_lock'

const LEGACY_SUBMITTING_LOCK_INDEX_NAME = 'organisationId_1_registrationId_1'
const RETIRED_YEAR_SCOPED_ID_INDEX_NAME =
  'organisationId_1_registrationId_1_year_1_accreditationId_1_status_1_submittedAt_-1'
const IGNORABLE_DROP_INDEX_ERRORS = new Set([
  'IndexNotFound',
  'NamespaceNotFound'
])

/**
 * @param {import('mongodb').Collection} collection
 * @param {string} name
 */
async function dropIndexIfPresent(collection, name) {
  try {
    await collection.dropIndex(name)
  } catch (error) {
    if (!IGNORABLE_DROP_INDEX_ERRORS.has(error.codeName)) {
      throw error
    }
  }
}

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

  await dropIndexIfPresent(collection, LEGACY_SUBMITTING_LOCK_INDEX_NAME)
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

  // Serves findLatestSubmitted and findAll. A registration holds few enough
  // summary logs that the year and accreditation are filtered after it.
  await collection.createIndex({
    organisationNumber: 1,
    registrationNumber: 1,
    status: 1,
    submittedAt: -1
  })

  // Serves findAllByOrgReg
  await collection.createIndex({
    organisationId: 1,
    registrationId: 1,
    status: 1,
    submittedAt: -1
  })

  await dropIndexIfPresent(collection, RETIRED_YEAR_SCOPED_ID_INDEX_NAME)

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

const WITHOUT_NUMBERS = {
  $or: [
    { organisationNumber: { $exists: false } },
    { registrationNumber: { $exists: false } },
    {
      accreditationId: { $exists: true },
      accreditationNumber: { $exists: false }
    }
  ]
}

const findIdsWithoutNumbers = (db) => async () => {
  const docs = await db
    .collection(COLLECTION_NAME)
    .find(WITHOUT_NUMBERS, { projection: { _id: 1 } })
    .toArray()
  return docs.map((doc) => doc._id)
}

const assignNumbers = (db, logger) => async (id, version, numbers) => {
  const validatedId = validateId(id)
  const validatedNumbers = validateSummaryLogNumbers(numbers)

  const keys = Object.keys(validatedNumbers)
  /** @type {any} */
  const filter = {
    _id: validatedId,
    version,
    ...Object.fromEntries(keys.map((key) => [key, { $exists: false }]))
  }
  const result = await db
    .collection(COLLECTION_NAME)
    .updateOne(filter, { $set: validatedNumbers, $inc: { version: 1 } })

  if (result.matchedCount === 0) {
    /** @type {any} */
    const findFilter = { _id: validatedId }
    const existing = await db.collection(COLLECTION_NAME).findOne(findFilter)

    if (!existing) {
      throw Boom.notFound(`Summary log with id ${validatedId} not found`)
    }

    const held = keys.filter((key) => existing[key] !== undefined)
    const conflictError = new Error(
      `Version conflict: attempted to assign numbers with version ${version} but current version is ${existing.version}, already holds ${held.join(', ') || 'none'}`
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
 * @import { Collection, Db, Filter } from 'mongodb'
 * @import { SummaryLog } from '#domain/summary-logs/model.js'
 * @import { SummaryLogKey } from '#domain/summary-logs/numbers.js'
 * @import { SummaryLogWithId } from './port.js'
 *
 * @typedef {SummaryLog & { _id: string, version: number }} SummaryLogDocument
 */

/**
 * @param {Db} db
 * @returns {Collection<SummaryLogDocument>}
 */
const summaryLogs = (db) =>
  /** @type {Collection<SummaryLogDocument>} */ (db.collection(COLLECTION_NAME))

/**
 * @param {Db} db
 * @param {Filter<SummaryLogDocument>} filter
 * @returns {Promise<SummaryLogWithId | null>}
 */
const latestSubmitted = async (db, filter) => {
  const doc = await summaryLogs(db).findOne(
    { ...filter, status: SUMMARY_LOG_STATUS.SUBMITTED },
    { sort: { submittedAt: -1 } }
  )

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

/**
 * Submitted and failed summary logs, newest upload first.
 *
 * @param {Db} db
 * @param {Filter<SummaryLogDocument>} filter
 * @returns {Promise<SummaryLogWithId[]>}
 */
const uploads = async (db, filter) => {
  const docs = await summaryLogs(db)
    .aggregate([
      {
        $match: {
          ...filter,
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

  return /** @type {(SummaryLogDocument & { _uploadedAt: string })[]} */ (
    docs
  ).map((doc) => {
    const { _id, version, _uploadedAt: _u, ...summaryLog } = doc
    return {
      id: _id,
      version,
      summaryLog: normaliseStoredSummaryLog(summaryLog)
    }
  })
}

const findAllByOrgReg = (db) => async (organisationId, registrationId) =>
  uploads(db, { organisationId, registrationId })

/**
 * A summary log stored before its accreditation was recorded has no
 * accreditation number, and matches every accreditation. One stored before
 * its year was recorded matches every year.
 *
 * @param {SummaryLogKey} key
 * @returns {Filter<SummaryLogDocument>}
 */
const keyFilter = (key) => {
  const { organisationNumber, registrationNumber, accreditationNumber, year } =
    validateSummaryLogKey(key)
  /** @type {Filter<SummaryLogDocument>[]} */
  const clauses = []
  if (accreditationNumber !== undefined) {
    clauses.push({
      $or: [
        { accreditationNumber },
        { accreditationNumber: { $exists: false } }
      ]
    })
  }
  if (year !== undefined) {
    clauses.push({
      $or: [{ year }, { year: { $exists: false } }, { year: { $type: 'null' } }]
    })
  }
  return {
    organisationNumber,
    registrationNumber,
    ...(clauses.length > 0 && { $and: clauses })
  }
}

/** @param {Db} db */
const findLatestSubmitted =
  (db) =>
  /** @param {SummaryLogKey} key */
  async (key) => {
    const found = await latestSubmitted(db, keyFilter(key))
    return found && keyedBy(key)(found)
  }

/** @param {Db} db */
const findAll =
  (db) =>
  /** @param {SummaryLogKey} key */
  async (key) =>
    (await uploads(db, keyFilter(key))).map(keyedBy(key))

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
    findIdsWithoutNumbers: findIdsWithoutNumbers(db),
    assignNumbers: assignNumbers(db, logger),
    findAllByOrgReg: findAllByOrgReg(db),
    findLatestSubmitted: findLatestSubmitted(db),
    findAll: findAll(db),
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
