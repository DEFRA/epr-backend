import { add, toNumber } from '#common/helpers/decimal-utils.js'
import {
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS
} from '#packaging-recycling-notes/domain/model.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import {
  BACKFILL_ACTOR,
  STREAM_EVENT_KIND,
  ZERO_BALANCE
} from '../repository/stream-schema.js'
import {
  closingForSummaryLogSubmitted,
  closingForPrn
} from './stream-closing-balance.js'
import { getTargetAmount } from './target-amount.js'

export { BACKFILL_ACTOR }

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

/**
 * Maps a PRN status transition to the stream event kind it implies, replayed
 * from a PRN's status history. Entries must be transitions the state machine
 * (`PRN_STATUS_TRANSITIONS`) permits.
 *
 * Scaffolding for the embedded→ledger migration: it synthesises events for
 * legacy PRNs that have no stream of their own. Once every accreditation is on
 * the ledger, balances fold from persisted events and this replay — along with
 * its re-enumeration of the state machine's transitions — retires.
 *
 * @type {Map<string, import('../repository/stream-schema.js').StreamEventKind>}
 */
const PRN_TRANSITION_MAP = new Map([
  [`*→${PRN_STATUS.AWAITING_AUTHORISATION}`, STREAM_EVENT_KIND.PRN_CREATED],
  [
    `${PRN_STATUS.AWAITING_AUTHORISATION}→${PRN_STATUS.AWAITING_ACCEPTANCE}`,
    STREAM_EVENT_KIND.PRN_ISSUED
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
 * Reduce a PRN status-history actor to the stream's user-summary shape. The
 * `id` is the proof of the actor; `name` rides along only when the source
 * carries one, never fabricated.
 *
 * @param {{ id: string, name?: string } | undefined} actor
 * @returns {import('../repository/stream-schema.js').StreamUserSummary}
 */
const actorOf = (actor) =>
  actor
    ? { id: actor.id, ...(actor.name && { name: actor.name }) }
    : { ...BACKFILL_ACTOR }

/**
 * Sparse count of backfilled-actor events keyed by the stream event kind that
 * fell back. Only kinds with at least one fallback appear.
 *
 * @typedef {Partial<Record<import('../repository/stream-schema.js').StreamEventKind, number>>} BackfillTally
 */

/**
 * Record one event-kind's fallback to the backfill actor in a per-kind tally.
 *
 * @param {BackfillTally} byKind
 * @param {import('../repository/stream-schema.js').StreamEventKind} kind
 */
const tallyBackfill = (byKind, kind) => {
  byKind[kind] = (byKind[kind] ?? 0) + 1
}

/**
 * Combine per-kind backfill tallies, summing counts for shared kinds.
 *
 * @param {BackfillTally[]} tallies
 * @returns {BackfillTally}
 */
const mergeBackfillTallies = (tallies) => {
  const merged = /** @type {BackfillTally} */ ({})
  for (const tally of tallies) {
    for (const [rawKind, count] of Object.entries(tally)) {
      const kind =
        /** @type {import('../repository/stream-schema.js').StreamEventKind} */ (
          rawKind
        )
      merged[kind] = (merged[kind] ?? 0) + count
    }
  }
  return merged
}

/**
 * Total backfilled-actor events across every kind in a tally.
 *
 * @param {BackfillTally} byKind
 * @returns {number}
 */
const totalBackfilled = (byKind) =>
  Object.values(byKind).reduce((sum, count) => sum + count, 0)

/**
 * Build summary-log-submitted events, threading the running set of seen
 * summary-log ids so each submission credits the waste-record data as it
 * stood at that point.
 *
 * @param {Object} params
 * @param {{ id: string }} params.accreditation
 * @param {string} params.registrationId
 * @param {string} params.organisationId
 * @param {Array} params.wasteRecords
 * @param {Object} params.overseasSites
 * @param {Array<{ id: string, status: string, submittedAt?: string, submittedBy?: import('../repository/stream-schema.js').StreamUserSummary }>} params.summaryLogs
 */
const buildSummaryLogEvents = ({
  accreditation,
  registrationId,
  organisationId,
  wasteRecords,
  overseasSites,
  summaryLogs
}) => {
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
  const events = []
  const backfilledActorCountByKind = /** @type {BackfillTally} */ ({})

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

    // One event is emitted per submitted log, so a missing submitter is
    // exactly one backfilled event — no need to gate on emission as the PRN
    // builder does.
    if (!summaryLog.submittedBy) {
      tallyBackfill(
        backfilledActorCountByKind,
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )
    }

    events.push({
      timestamp: new Date(summaryLog.submittedAt),
      kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId: summaryLog.id, creditTotal },
      registrationId,
      accreditationId: accreditation.id,
      organisationId,
      createdBy: actorOf(summaryLog.submittedBy)
    })
  }

  return { events, backfilledActorCountByKind }
}

/**
 * Build the stream event for a single PRN status-history entry, or null when
 * the transition is a valid state-machine move that produces no balance event.
 * An idempotent same-state repeat (a duplicate history entry left by a
 * concurrent double-submit) collapses to a no-op — no PRN transition is a
 * self-loop, so a repeat of the prior status carries no change. Throws when a
 * move to a *different* state cannot occur in the PRN state machine, surfacing
 * genuinely corrupt source history.
 *
 * @param {Object} params
 * @param {{ id: string, tonnage: number, status: { history: Array<{ status: string, at: Date, by?: { id: string, name: string } }> } }} params.prn
 * @param {number} params.index
 * @param {{ id: string }} params.accreditation
 * @param {string} params.registrationId
 * @param {string} params.organisationId
 */
const prnTransitionEvent = ({
  prn,
  index,
  accreditation,
  registrationId,
  organisationId
}) => {
  const history = prn.status.history
  const prevStatus = index === 0 ? null : history[index - 1].status
  const newStatus = history[index].status

  if (prevStatus !== null && prevStatus === newStatus) {
    return null
  }

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
    return null
  }

  return {
    timestamp: history[index].at,
    kind,
    payload: { prnId: prn.id, amount: prn.tonnage },
    registrationId,
    accreditationId: accreditation.id,
    organisationId,
    createdBy: actorOf(history[index].by)
  }
}

/**
 * Build the events from a single PRN's status history, counting those that
 * fall back to the system backfill actor because the history entry names none.
 *
 * @param {Object} params
 * @param {Object} params.prn
 * @param {{ id: string }} params.accreditation
 * @param {string} params.registrationId
 * @param {string} params.organisationId
 */
const buildPrnHistoryEvents = ({
  prn,
  accreditation,
  registrationId,
  organisationId
}) => {
  const history = prn.status.history
  const events = []
  const backfilledActorCountByKind = /** @type {BackfillTally} */ ({})

  for (let i = 0; i < history.length; i++) {
    const event = prnTransitionEvent({
      prn,
      index: i,
      accreditation,
      registrationId,
      organisationId
    })
    if (event === null) {
      continue
    }
    events.push(event)
    if (!history[i].by) {
      tallyBackfill(backfilledActorCountByKind, event.kind)
    }
  }

  return { events, backfilledActorCountByKind }
}

/**
 * Build PRN events from every status transition in each PRN's history.
 *
 * @param {Object} params
 * @param {{ id: string }} params.accreditation
 * @param {string} params.registrationId
 * @param {string} params.organisationId
 * @param {Array} params.prns
 */
const buildPrnEvents = ({
  accreditation,
  registrationId,
  organisationId,
  prns
}) => {
  const perPrn = prns.map((prn) =>
    buildPrnHistoryEvents({
      prn,
      accreditation,
      registrationId,
      organisationId
    })
  )

  return {
    events: perPrn.flatMap(({ events }) => events),
    backfilledActorCountByKind: mergeBackfillTallies(
      perPrn.map(({ backfilledActorCountByKind }) => backfilledActorCountByKind)
    )
  }
}

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
const buildChronologicalEvents = (params) => {
  const summaryLog = buildSummaryLogEvents(params)
  const prn = buildPrnEvents(params)

  return {
    events: [...summaryLog.events, ...prn.events],
    backfilledActorCountByKind: mergeBackfillTallies([
      summaryLog.backfilledActorCountByKind,
      prn.backfilledActorCountByKind
    ])
  }
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
 * seedable into the stream store, not only a totals cross-check. Also reports
 * `backfilledActorCount`: how many events fell back to the backfill actor
 * because no real actor was recoverable, and `backfilledActorCountByKind`: the
 * same total broken down by stream event kind, so callers can surface
 * attribution gaps and see which event kinds drive them.
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
  const { events: unsorted, backfilledActorCountByKind } =
    buildChronologicalEvents({
      accreditation,
      registrationId,
      organisationId,
      wasteRecords,
      prns,
      overseasSites,
      summaryLogs
    })

  const backfilledActorCount = totalBackfilled(backfilledActorCountByKind)

  unsorted.sort(byStreamOrder)

  const events = replayStream(unsorted)

  if (events.length === 0) {
    return {
      events,
      ...ZERO_BALANCE,
      backfilledActorCount,
      backfilledActorCountByKind
    }
  }

  const finalBalance =
    /** @type {import('../repository/stream-schema.js').StreamEventInsert} */ (
      events.at(-1)
    ).closingBalance

  return {
    events,
    amount: finalBalance.amount,
    availableAmount: finalBalance.availableAmount,
    backfilledActorCount,
    backfilledActorCountByKind
  }
}
