import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'
import { LEDGER_EVENT_KIND_TO_PRN_STATUS } from '#packaging-recycling-notes/domain/prn-transition.js'

import { COLLECTION_NAME as PACKAGING_RECYCLING_NOTES_COLLECTION_NAME } from './mongodb.js'

/**
 * @typedef {import('mongodb').ObjectId} ObjectId
 */

/**
 * @typedef {Object} DriftResult
 * @property {number} total - every PRN document, drifting or not
 * @property {ObjectId[]} driftingIds - the `_id`s of documents whose stored status disagrees with their ledger
 */

/**
 * The status the read-side fold would settle a PRN on, expressed for Mongo: a
 * `$switch` from the latest unapplied event's `kind` to the status that kind
 * projects to. Built from `LEDGER_EVENT_KIND_TO_PRN_STATUS`, the same table the
 * JS fold derives from, so the query and the fold cannot drift. An unmapped kind
 * folds to `null` — never equal to a stored status, so it surfaces as drift for
 * the per-PRN re-read to fail loudly rather than the query to hide it.
 */
const FOLDED_STATUS_FROM_LATEST_EVENT = {
  $switch: {
    branches: Object.entries(LEDGER_EVENT_KIND_TO_PRN_STATUS).map(
      ([kind, status]) => ({
        case: { $eq: [{ $arrayElemAt: ['$unappliedTail.kind', 0] }, kind] },
        then: status
      })
    ),
    default: null
  }
}

/**
 * Detects which PRN documents carry a stored status that disagrees with their
 * ledger's latest event, keyed per-PRN so a sibling advancing the shared
 * `(registrationId, accreditationId)` slot sequence cannot falsely flag one
 * (ADR-0047). The `$lookup` sub-pipeline joins each PRN to events for ITS OWN
 * `payload.prnId` past its watermark (a missing watermark reads as `0`) and
 * keeps only the latest — enough to name the status the fold would settle on,
 * since the fold is last-write-wins. The caller re-reads the full tail through
 * the validated catch-up path. Index-backed by `prn_watermark_catchup`.
 *
 * The watermark-behind population splits two ways: projections whose stored
 * status already matches the fold (a benign backfill left the watermark unset)
 * and those genuinely frozen a transition behind. Only the latter is
 * user-facing, so the pipeline folds the latest event to a status and keeps a
 * PRN only when that status differs from the stored one. The benign backfill is
 * left for the data-quality follow-up rather than surfaced on every sweep.
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
        { $sort: { number: -1 } },
        { $limit: 1 },
        { $project: { _id: 0, kind: 1 } }
      ],
      as: 'unappliedTail'
    }
  },
  { $match: { 'unappliedTail.0': { $exists: true } } },
  { $set: { foldedStatus: FOLDED_STATUS_FROM_LATEST_EVENT } },
  { $match: { $expr: { $ne: ['$foldedStatus', '$status.currentStatus'] } } },
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
