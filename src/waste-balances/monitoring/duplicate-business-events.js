import {
  PRN_KINDS,
  LEDGER_EVENT_KIND
} from '#waste-balances/repository/ledger-schema.js'

/**
 * A business event should occupy one slot in its ledger: `(prnId, kind)` arises
 * at most once, and a summary-log submission carries a distinct id.
 *
 * A detection heuristic, not an invariant. Do not reuse it on the write path,
 * where it would forbid a transition a future state machine allows.
 */
const DUPLICATE_THRESHOLD = 1

/**
 * @typedef {Object} DuplicateEntry
 * @property {number} number - the ledger slot the event occupies
 * @property {Date} [createdAt] - absent when the stored document carries none
 */

/**
 * @typedef {Object} DuplicateGroup
 * @property {Record<string, string | null>} _id - the identity that repeated
 * @property {number} count - how many slots carry that identity
 * @property {DuplicateEntry[]} entries - ascending by slot number
 * @property {string[]} organisationIds - the organisations its events were written under
 */

/**
 * `entries` pushes one document rather than two parallel arrays: `$push` of a
 * field path contributes nothing when the field is missing, so parallel arrays
 * can differ in length and pair a slot with another slot's write time.
 *
 * `organisationId` is reported, not grouped by. It is not part of the slot
 * identity, and grouping by it would split a duplicate group wherever two
 * events disagreed on it.
 */
const groupByIdentityStages = (
  /** @type {Record<string, string>} */ identity
) => [
  {
    $group: {
      _id: identity,
      count: { $sum: 1 },
      entries: { $push: { number: '$number', createdAt: '$createdAt' } },
      organisationIds: { $addToSet: '$organisationId' }
    }
  },
  { $match: { count: { $gt: DUPLICATE_THRESHOLD } } },
  { $sort: { count: -1 } }
]

/** Every PRN event kind is covered identically. */
const duplicatePrnEventsPipeline = () => [
  { $match: { kind: { $in: [...PRN_KINDS] } } },
  ...groupByIdentityStages({
    registrationId: '$registrationId',
    accreditationId: '$accreditationId',
    prnId: '$payload.prnId',
    kind: '$kind'
  })
]

const duplicateSummaryLogEventsPipeline = () => [
  { $match: { kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED } },
  ...groupByIdentityStages({
    registrationId: '$registrationId',
    accreditationId: '$accreditationId',
    summaryLogId: '$payload.summaryLogId'
  })
]

/**
 * `DuplicateGroup` is declared here, not validated: the diagnostic has to
 * survive whatever it finds. `allowDiskUse` because the `$group` accumulates
 * every distinct identity before the count filter, on a collection that grows
 * without bound.
 *
 * @param {Pick<import('mongodb').Collection, 'aggregate'>} collection
 * @param {object[]} pipeline
 * @returns {Promise<DuplicateGroup[]>}
 */
const runPipeline = async (collection, pipeline) => {
  const groups = await collection
    .aggregate(pipeline, { allowDiskUse: true })
    .toArray()
  return /** @type {DuplicateGroup[]} */ (groups)
}

/**
 * The aggregation returns `$push`ed arrays in scan order, and `$addToSet` is
 * unordered.
 *
 * @param {DuplicateGroup} group
 * @returns {DuplicateGroup}
 */
const inSlotOrder = (group) => ({
  ...group,
  entries: [...group.entries].sort((a, b) => a.number - b.number),
  organisationIds: [...group.organisationIds].sort((a, b) => a.localeCompare(b))
})

/**
 * Read-only sweep for two events written for one action, which on a PRN
 * cancellation credits the balance twice. The `partition_number` index does not
 * cover this: it stops two writers taking the same slot, not one that folds the
 * ledger after a competing append and takes the next.
 *
 * @param {Pick<import('mongodb').Collection, 'aggregate'>} collection - the waste-balance-events collection
 * @returns {Promise<{ prn: DuplicateGroup[], summaryLog: DuplicateGroup[] }>}
 */
export const findDuplicateBusinessEvents = async (collection) => {
  const [prn, summaryLog] = await Promise.all([
    runPipeline(collection, duplicatePrnEventsPipeline()),
    runPipeline(collection, duplicateSummaryLogEventsPipeline())
  ])
  return {
    prn: prn.map(inSlotOrder),
    summaryLog: summaryLog.map(inSlotOrder)
  }
}
