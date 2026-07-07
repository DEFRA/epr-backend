/** @import { Collection, Db } from 'mongodb' */

/** @import { BackfillWatermark } from './port.js' */

export const SUMMARY_LOG_ROW_STATES_BACKFILL_WATERMARKS_COLLECTION_NAME =
  'summary-log-row-states-backfill-watermarks'

/**
 * Ensures the backfill-watermark collection exists with a unique index on the
 * registration identity, so each registration carries at most one watermark and
 * `advance` upserts against it deterministically.
 *
 * Safe to call multiple times — MongoDB `createIndex` is idempotent for
 * matching specifications.
 *
 * @param {Db} db
 * @returns {Promise<Collection>}
 */
export async function ensureSummaryLogRowStatesBackfillWatermarksCollection(
  db
) {
  const collection = db.collection(
    SUMMARY_LOG_ROW_STATES_BACKFILL_WATERMARKS_COLLECTION_NAME
  )

  await collection.createIndex(
    { organisationId: 1, registrationId: 1 },
    { name: 'registration_identity', unique: true }
  )

  return collection
}

/**
 * @param {Collection} collection
 * @returns {(organisationId: string, registrationId: string) => Promise<BackfillWatermark | null>}
 */
const performRead = (collection) => async (organisationId, registrationId) => {
  const doc = await collection.findOne({ organisationId, registrationId })
  if (!doc) {
    return null
  }
  return { submittedAt: doc.submittedAt, summaryLogId: doc.summaryLogId }
}

/**
 * @param {Collection} collection
 * @returns {(organisationId: string, registrationId: string, watermark: BackfillWatermark) => Promise<void>}
 */
const performAdvance =
  (collection) => async (organisationId, registrationId, watermark) => {
    await collection.updateOne(
      { organisationId, registrationId },
      {
        $set: {
          submittedAt: watermark.submittedAt,
          summaryLogId: watermark.summaryLogId
        }
      },
      { upsert: true }
    )
  }

/**
 * Creates a MongoDB-backed summary-log-row-states backfill watermark repository.
 *
 * @param {Db} db
 * @returns {Promise<import('./port.js').SummaryLogRowStatesBackfillWatermarkRepositoryFactory>}
 */
export const createMongoSummaryLogRowStatesBackfillWatermarkRepository = async (
  db
) => {
  const collection =
    await ensureSummaryLogRowStatesBackfillWatermarksCollection(db)

  return () => ({
    read: performRead(collection),
    advance: performAdvance(collection)
  })
}
