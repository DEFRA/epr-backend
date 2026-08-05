import { ObjectId } from 'mongodb'
import {
  SUMMARY_LOG_SUB_CATEGORY,
  SUMMARY_LOG_SUBMIT_ACTION
} from '#root/auditing/summary-logs.js'
import { buildPage } from './pagination.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { FindParams, SystemLogActor, SystemLogsRepositoryFactory } from './port.js' */

export const SYSTEM_LOGS_COLLECTION_NAME = 'system-logs'

/**
 * Normalise a stored actor so a human session always reads back with an explicit
 * role: a stored human actor with no role field surfaces as null rather than
 * absent. A machine actor is returned untouched.
 *
 * @param {any} createdBy
 * @returns {SystemLogActor}
 */
const normaliseActorRole = (createdBy) =>
  'email' in createdBy && !('role' in createdBy)
    ? { ...createdBy, role: null }
    : createdBy

/**
 * Ensures the collection exists with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {Db} db
 * @returns {Promise<Collection>}
 */
async function ensureCollection(db) {
  const collection = db.collection(SYSTEM_LOGS_COLLECTION_NAME)

  await collection.createIndex({ 'context.organisationId': 1, _id: -1 })
  await collection.createIndex({ 'createdBy.id': 1, _id: -1 })

  return collection
}

const performInsert = (db, logger) => async (systemLog) => {
  try {
    await db.collection(SYSTEM_LOGS_COLLECTION_NAME).insertOne({
      schemaVersion: 1,
      ...systemLog
    })
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to internally record system log'
    })
  }
}

const performInsertMany = (db, logger) => async (systemLogs) => {
  if (systemLogs.length === 0) {
    return
  }

  try {
    await db.collection(SYSTEM_LOGS_COLLECTION_NAME).insertMany(
      systemLogs.map((log) => ({ schemaVersion: 1, ...log })),
      {
        ordered: false
      }
    )
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to internally record system logs'
    })
  }
}

const performFind =
  (db) =>
  async (
    /** @type {FindParams} */ {
      organisationId,
      userId,
      subCategory,
      limit,
      cursor,
      direction
    }
  ) => {
    const isPrev = direction === 'prev'

    const filter = {}
    if (organisationId) {
      filter['context.organisationId'] = organisationId
    }
    if (userId) {
      filter['createdBy.id'] = userId
    }
    if (subCategory) {
      filter['event.subCategory'] = subCategory
    }
    if (cursor) {
      const cursorId = ObjectId.createFromHexString(cursor)
      filter._id = isPrev ? { $gt: cursorId } : { $lt: cursorId }
    }

    const docs = await db
      .collection(SYSTEM_LOGS_COLLECTION_NAME)
      .find(filter)
      .sort({ _id: isPrev ? 1 : -1 })
      .limit(limit + 1)
      .toArray()

    const { page, hasNext, hasPrev, nextCursor, prevCursor } = buildPage(docs, {
      limit,
      isPrev,
      hasCursor: Boolean(cursor),
      toCursor: (doc) => doc._id.toHexString()
    })

    return {
      systemLogs: page.map((doc) => ({
        event: doc.event,
        context: doc.context,
        createdAt: doc.createdAt,
        createdBy: normaliseActorRole(doc.createdBy)
      })),
      hasNext,
      hasPrev,
      nextCursor,
      prevCursor
    }
  }

const performFindSummaryLogSubmitActors = (db) => async (summaryLogIds) => {
  if (summaryLogIds.length === 0) {
    return []
  }

  const docs = await db
    .collection(SYSTEM_LOGS_COLLECTION_NAME)
    .find(
      {
        'context.summaryLogId': { $in: summaryLogIds },
        'event.subCategory': SUMMARY_LOG_SUB_CATEGORY,
        'event.action': SUMMARY_LOG_SUBMIT_ACTION
      },
      {
        projection: { _id: 0, 'context.summaryLogId': 1, createdBy: 1 },
        sort: { _id: -1 }
      }
    )
    .toArray()

  return docs.map((doc) => ({
    summaryLogId: doc.context.summaryLogId,
    createdBy: doc.createdBy
  }))
}

/**
 * @param {Db} db - MongoDB database instance
 * @returns {Promise<SystemLogsRepositoryFactory>}
 */
export const createSystemLogsRepository = async (db) => {
  await ensureCollection(db)

  return (logger) => ({
    insert: performInsert(db, logger),
    insertMany: performInsertMany(db, logger),
    find: performFind(db),
    findSummaryLogSubmitActors: performFindSummaryLogSubmitActors(db)
  })
}
