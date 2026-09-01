import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'

import { COLLECTION_NAME as PACKAGING_RECYCLING_NOTES_COLLECTION_NAME } from './mongodb.js'

/**
 * @typedef {import('mongodb').ObjectId} ObjectId
 */

/**
 * @typedef {Object} DriftResult
 * @property {number} total - every PRN document, drifting or not
 * @property {ObjectId[]} driftingIds - the `_id`s of documents behind their ledger
 */

/**
 * Detects which PRN documents lag their ledger, keyed per-PRN so a sibling
 * advancing the shared `(registrationId, accreditationId)` slot sequence cannot
 * falsely flag one (ADR-0047). The `$lookup` sub-pipeline joins each PRN to
 * events for ITS OWN `payload.prnId` past its watermark (a missing watermark
 * reads as `0`) and stops at the first — this is an existence probe, not a
 * fetch, so the caller re-reads the tail through the validated catch-up path.
 * Index-backed by `prn_watermark_catchup`; returns only the drifting `_id`s.
 *
 * The join omits `organisationId` (the catch-up read includes it): an
 * accreditation belongs to one registration belongs to one organisation, so
 * `(registrationId, accreditationId)` plus the unique `payload.prnId` already
 * name exactly one event stream. Adding the organisation could not narrow it.
 */
const DRIFTING_IDS_PIPELINE = [
  {
    $lookup: {
      from: WASTE_BALANCE_EVENTS_COLLECTION_NAME,
      let: {
        rid: '$registrationId',
        aid: '$accreditation.id',
        pid: { $toString: '$_id' },
        wm: { $ifNull: ['$lastAppliedEventNumber', 0] }
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$registrationId', '$$rid'] },
                { $eq: ['$accreditationId', '$$aid'] },
                { $eq: ['$payload.prnId', '$$pid'] },
                { $gt: ['$number', '$$wm'] }
              ]
            }
          }
        },
        { $limit: 1 }
      ],
      as: 'unappliedTail'
    }
  },
  { $match: { 'unappliedTail.0': { $exists: true } } },
  { $project: { _id: 1 } }
]

/**
 * Builds the drift query over a database's PRN collection. The total document
 * count comes from collection metadata (`estimatedDocumentCount`), so the drift
 * scan carries no result-set size ceiling.
 *
 * @param {import('mongodb').Db} db
 * @returns {() => Promise<DriftResult>}
 */
export const createDriftQuery = (db) => {
  const collection = db.collection(PACKAGING_RECYCLING_NOTES_COLLECTION_NAME)

  return async () => {
    const [total, docs] = await Promise.all([
      collection.estimatedDocumentCount(),
      collection.aggregate(DRIFTING_IDS_PIPELINE).toArray()
    ])
    return { total, driftingIds: docs.map((doc) => doc._id) }
  }
}
