import {
  PRN_KINDS,
  STREAM_EVENT_KIND
} from '#waste-balances/repository/stream-schema.js'

/**
 * A business event should occupy exactly one slot in its partition: the PRN
 * status machine is an acyclic DAG with terminal states, so each `(prnId, kind)`
 * arises at most once, and a summary-log submission carries a distinct id. More
 * than one slot for the same business identity is a duplicate — two events
 * written for a single action.
 */
const DUPLICATE_THRESHOLD = 1

/**
 * Shape of each aggregation result row (documentation of what the pipelines
 * produce — aggregation output is dynamically typed, so the functions return
 * the driver's `Document`).
 *
 * @typedef {Object} DuplicateGroup
 * @property {Record<string, string | null>} _id - the business identity that repeated
 * @property {number} count - how many slots carry that identity
 * @property {number[]} numbers - the partition slot numbers of the repeated events
 * @property {import('mongodb').ObjectId[]} eventIds - storage ids, to locate each event
 * @property {Date[]} createdAt - when each duplicate was written
 */

const groupByIdentityStages = (
  /** @type {Record<string, string>} */ identity
) => [
  {
    $group: {
      _id: identity,
      count: { $sum: 1 },
      numbers: { $push: '$number' },
      eventIds: { $push: '$_id' },
      createdAt: { $push: '$createdAt' }
    }
  },
  { $match: { count: { $gt: DUPLICATE_THRESHOLD } } },
  { $sort: { count: -1 } }
]

/**
 * Aggregation pipeline flagging PRN business events (`prn-created`, `prn-issued`,
 * …) that occupy more than one slot for the same
 * `(registrationId, accreditationId, prnId, kind)`.
 */
export const duplicatePrnEventsPipeline = () => [
  { $match: { kind: { $in: [...PRN_KINDS] } } },
  ...groupByIdentityStages({
    registrationId: '$registrationId',
    accreditationId: '$accreditationId',
    prnId: '$payload.prnId',
    kind: '$kind'
  })
]

/**
 * Aggregation pipeline flagging summary-log submissions that occupy more than
 * one slot for the same `(registrationId, accreditationId, summaryLogId)`.
 */
export const duplicateSummaryLogEventsPipeline = () => [
  { $match: { kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED } },
  ...groupByIdentityStages({
    registrationId: '$registrationId',
    accreditationId: '$accreditationId',
    summaryLogId: '$payload.summaryLogId'
  })
]

/**
 * Read-only sweep of the waste-balance event stream for duplicate business
 * events — the signature of the pre-optimistic-concurrency append path writing
 * two events for one action. Runs both pipelines against the given collection.
 *
 * To run through the CDP terminal (`/query-cdp-mongodb`), paste each pipeline
 * into mongosh:
 *   db.getCollection("waste-balance-events").aggregate(<pipeline>)
 *
 * Each result row has the shape of a {@link DuplicateGroup}.
 *
 * @param {Pick<import('mongodb').Collection, 'aggregate'>} collection - the waste-balance-events collection
 * @returns {Promise<{ prn: import('mongodb').Document[], summaryLog: import('mongodb').Document[] }>}
 */
export const findDuplicateBusinessEvents = async (collection) => {
  const [prn, summaryLog] = await Promise.all([
    collection.aggregate(duplicatePrnEventsPipeline()).toArray(),
    collection.aggregate(duplicateSummaryLogEventsPipeline()).toArray()
  ])
  return { prn, summaryLog }
}
