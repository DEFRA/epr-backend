import { add, toNumber } from '#common/helpers/decimal-utils.js'
import {
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS
} from '#packaging-recycling-notes/domain/model.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import { STREAM_EVENT_KIND, ZERO_BALANCE } from '../repository/stream-schema.js'
import {
  closingForSummaryLogSubmitted,
  closingForPrn
} from './stream-closing-balance.js'
import { getTargetAmount } from './target-amount.js'

/**
 * Attribution for backfilled events with no recoverable real actor. The
 * submitting session for historical summary-log submissions is not persisted
 * on the summary-log document or the waste-record version, so a backfill
 * supplies it out of band where it can; absent that, events are attributed to
 * the system.
 *
 * @type {Readonly<import('../repository/stream-schema.js').StreamUserSummary>}
 */
export const BACKFILL_ACTOR = Object.freeze({ id: 'system', name: 'backfill' })

/**
 * Reconstruct a waste record's data as it existed at a given submission
 * point. Layers version data objects via shallow merge, stopping at the
 * latest version whose summaryLog.id appears in the seen set.
 *
 * @param {Array<{ summaryLog: { id: string }, data: Object }>} versions
 * @param {Set<string>} seenSummaryLogIds
 * @returns {Object | null}
 */
const reconstructDataAtSubmission = (versions, seenSummaryLogIds) => {
  let lastMatchIndex = -1

  for (let i = 0; i < versions.length; i++) {
    if (seenSummaryLogIds.has(versions[i].summaryLog.id)) {
      lastMatchIndex = i
    }
  }

  if (lastMatchIndex === -1) {
    return null
  }

  let data = {}
  for (let i = 0; i <= lastMatchIndex; i++) {
    data = { ...data, ...versions[i].data }
  }

  return data
}

/** @type {Map<string, import('../repository/stream-schema.js').StreamEventKind>} */
const PRN_TRANSITION_MAP = new Map([
  [`*→${PRN_STATUS.AWAITING_AUTHORISATION}`, STREAM_EVENT_KIND.PRN_CREATED],
  [
    `${PRN_STATUS.AWAITING_AUTHORISATION}→${PRN_STATUS.AWAITING_ACCEPTANCE}`,
    STREAM_EVENT_KIND.PRN_ISSUED
  ],
  [
    `${PRN_STATUS.AWAITING_AUTHORISATION}→${PRN_STATUS.CANCELLED}`,
    STREAM_EVENT_KIND.PRN_CREATION_CANCELLED
  ],
  [
    `${PRN_STATUS.AWAITING_AUTHORISATION}→${PRN_STATUS.DELETED}`,
    STREAM_EVENT_KIND.PRN_CREATION_CANCELLED
  ],
  [
    `${PRN_STATUS.AWAITING_CANCELLATION}→${PRN_STATUS.CANCELLED}`,
    STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE
  ],
  [
    `${PRN_STATUS.AWAITING_ACCEPTANCE}→${PRN_STATUS.ACCEPTED}`,
    STREAM_EVENT_KIND.PRN_ACCEPTED
  ],
  [
    `${PRN_STATUS.AWAITING_ACCEPTANCE}→${PRN_STATUS.AWAITING_CANCELLATION}`,
    STREAM_EVENT_KIND.PRN_REJECTED
  ]
])

/**
 * Map a PRN status transition to a stream event kind.
 *
 * @param {string | null} prevStatus
 * @param {string} newStatus
 * @returns {import('../repository/stream-schema.js').StreamEventKind | null}
 */
export const prnTransitionToStreamKind = (prevStatus, newStatus) =>
  PRN_TRANSITION_MAP.get(`${prevStatus}→${newStatus}`) ??
  PRN_TRANSITION_MAP.get(`*→${newStatus}`) ??
  null

/**
 * Whether a status move exists in the PRN state machine, irrespective of
 * which actor performed it. Used to detect corrupt source history rather
 * than to authorise a live transition.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
const isStructurallyValidPrnTransition = (fromStatus, toStatus) =>
  (PRN_STATUS_TRANSITIONS[fromStatus] ?? []).some((t) => t.status === toStatus)

/**
 * Reduce a PRN status-history actor to the stream's user-summary shape.
 *
 * @param {{ id: string, name: string } | undefined} actor
 * @returns {import('../repository/stream-schema.js').StreamUserSummary}
 */
const actorOf = (actor) =>
  actor ? { id: actor.id, name: actor.name } : { ...BACKFILL_ACTOR }

/**
 * Build an unsorted list of chronologically timestamped event tuples
 * from summary log submissions and PRN status transitions.
 *
 * @param {Object} params
 * @param {{ id: string }} params.accreditation
 * @param {string} params.registrationId
 * @param {string} params.organisationId
 * @param {Array} params.wasteRecords
 * @param {Array} params.prns
 * @param {Object} params.overseasSites
 * @param {Array<{ id: string, status: string, submittedAt?: string, submittedBy?: import('../repository/stream-schema.js').StreamUserSummary }>} params.summaryLogs
 */
const buildChronologicalEvents = ({
  accreditation,
  registrationId,
  organisationId,
  wasteRecords,
  prns,
  overseasSites,
  summaryLogs
}) => {
  const events = []

  const submitted = summaryLogs
    .filter(
      /** @returns {sl is { id: string, status: string, submittedAt: string, submittedBy?: import('../repository/stream-schema.js').StreamUserSummary }} */
      (sl) => sl.status === SUMMARY_LOG_STATUS.SUBMITTED
    )
    .sort(
      (a, b) =>
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
    )

  const seenSummaryLogIds = new Set()

  for (const summaryLog of submitted) {
    seenSummaryLogIds.add(summaryLog.id)

    let creditTotal = 0
    for (const record of wasteRecords) {
      const data = reconstructDataAtSubmission(
        record.versions,
        seenSummaryLogIds
      )
      if (data === null) {
        continue
      }
      const amount = getTargetAmount(
        { ...record, data },
        accreditation,
        overseasSites
      )
      creditTotal = toNumber(add(creditTotal, amount))
    }

    events.push({
      timestamp: new Date(summaryLog.submittedAt),
      kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId: summaryLog.id, creditTotal },
      registrationId,
      accreditationId: accreditation.id,
      organisationId,
      createdBy: summaryLog.submittedBy ?? { ...BACKFILL_ACTOR }
    })
  }

  for (const prn of prns) {
    const history = prn.status.history
    for (let i = 0; i < history.length; i++) {
      const prevStatus = i === 0 ? null : history[i - 1].status
      const newStatus = history[i].status
      const kind = prnTransitionToStreamKind(prevStatus, newStatus)

      if (kind === null) {
        if (
          prevStatus !== null &&
          !isStructurallyValidPrnTransition(prevStatus, newStatus)
        ) {
          throw new Error(
            `Impossible PRN status transition in history for prnId=${prn.id}: ${prevStatus} -> ${newStatus}`
          )
        }
        continue
      }
      events.push({
        timestamp: history[i].at,
        kind,
        payload: { prnId: prn.id, amount: prn.tonnage },
        registrationId,
        accreditationId: accreditation.id,
        organisationId,
        createdBy: actorOf(history[i].by)
      })
    }
  }

  return events
}

/**
 * Replay a chronologically sorted list of events, threading opening and
 * closing balances through each event. Assigns sequential slot numbers.
 *
 * @param {Array<{
 *   timestamp: Date,
 *   kind: import('../repository/stream-schema.js').StreamEventKind,
 *   payload: Object,
 *   registrationId: string,
 *   accreditationId: string | null,
 *   organisationId: string,
 *   createdBy: import('../repository/stream-schema.js').StreamUserSummary
 * }>} events
 * @returns {import('../repository/stream-schema.js').StreamEventInsert[]}
 */
const replayStream = (events) => {
  const result = []
  let previousBalance = { ...ZERO_BALANCE }
  let previousCreditTotal = 0

  for (let i = 0; i < events.length; i++) {
    const { timestamp, kind, payload, createdBy, ...context } = events[i]
    const openingBalance = { ...previousBalance }

    let closingBalance
    if (kind === STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED) {
      const { creditTotal } = payload
      closingBalance = closingForSummaryLogSubmitted(
        openingBalance,
        creditTotal,
        previousCreditTotal
      )
      previousCreditTotal = creditTotal
    } else {
      closingBalance = closingForPrn(openingBalance, kind, payload.amount)
    }

    result.push({
      ...context,
      number: i + 1,
      kind,
      payload,
      openingBalance,
      closingBalance,
      createdAt: timestamp,
      createdBy
    })

    previousBalance = closingBalance
  }

  return result
}

const SUMMARY_LOG_KIND_PRIORITY = 0
const PRN_KIND_PRIORITY = 1

const kindOrdering = (kind) =>
  kind === STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
    ? SUMMARY_LOG_KIND_PRIORITY
    : PRN_KIND_PRIORITY

const naturalKey = (event) =>
  event.kind === STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
    ? event.payload.summaryLogId
    : event.payload.prnId

/**
 * Total order over events for deterministic seeding. Primary by timestamp;
 * a summary-log submission precedes a PRN op sharing its instant so the PRN
 * sees the post-submission balance; remaining ties break on natural key.
 *
 * @param {{ timestamp: Date, kind: string, payload: Object }} a
 * @param {{ timestamp: Date, kind: string, payload: Object }} b
 * @returns {number}
 */
const byStreamOrder = (a, b) =>
  a.timestamp.getTime() - b.timestamp.getTime() ||
  kindOrdering(a.kind) - kindOrdering(b.kind) ||
  naturalKey(a).localeCompare(naturalKey(b))

/**
 * Reconstruct the full historical event stream for an accreditation and
 * derive balance totals from it. Events are totally ordered, carry real
 * registration / organisation context and actor attribution, and throw on
 * source history that violates the PRN state machine — so the sequence is
 * seedable into the stream store, not only a totals cross-check.
 *
 * @param {Object} params
 * @param {{ id: string }} params.accreditation
 * @param {string} params.registrationId
 * @param {string} params.organisationId
 * @param {Array} params.wasteRecords
 * @param {Array} params.prns
 * @param {Object} params.overseasSites
 * @param {Array<{ id: string, status: string, submittedAt?: string, submittedBy?: import('../repository/stream-schema.js').StreamUserSummary }>} params.summaryLogs
 */
export const computeRebuiltStream = ({
  accreditation,
  registrationId,
  organisationId,
  wasteRecords,
  prns,
  overseasSites,
  summaryLogs
}) => {
  const unsorted = buildChronologicalEvents({
    accreditation,
    registrationId,
    organisationId,
    wasteRecords,
    prns,
    overseasSites,
    summaryLogs
  })

  unsorted.sort(byStreamOrder)

  const events = replayStream(unsorted)

  if (events.length === 0) {
    return { events, ...ZERO_BALANCE }
  }

  const finalBalance =
    /** @type {import('../repository/stream-schema.js').StreamEventInsert} */ (
      events.at(-1)
    ).closingBalance

  return {
    events,
    amount: finalBalance.amount,
    availableAmount: finalBalance.availableAmount
  }
}
