import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import { STREAM_EVENT_KIND, ZERO_BALANCE } from '../repository/stream-schema.js'
import {
  closingForSummaryLogSubmitted,
  closingForPrn
} from './stream-closing-balance.js'
import { getTargetAmount } from './target-amount.js'

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
 * Build an unsorted list of chronologically timestamped event tuples
 * from summary log submissions and PRN status transitions.
 *
 * @param {Object} params
 * @param {{ id: string }} params.accreditation
 * @param {Array} params.wasteRecords
 * @param {Array} params.prns
 * @param {Object} params.overseasSites
 * @param {Array<{ id: string, status: string, submittedAt?: string }>} params.summaryLogs
 */
const buildChronologicalEvents = ({
  accreditation,
  wasteRecords,
  prns,
  overseasSites,
  summaryLogs
}) => {
  const events = []

  const submitted = summaryLogs
    .filter(
      /** @returns {sl is { id: string, status: string, submittedAt: string }} */
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
      registrationId: wasteRecords[0]?.registrationId,
      accreditationId: accreditation.id,
      organisationId: wasteRecords[0]?.organisationId
    })
  }

  for (const prn of prns) {
    const history = prn.status.history
    for (let i = 0; i < history.length; i++) {
      const prevStatus = i === 0 ? null : history[i - 1].status
      const kind = prnTransitionToStreamKind(prevStatus, history[i].status)
      if (kind === null) {
        continue
      }
      events.push({
        timestamp: history[i].at,
        kind,
        payload: { prnId: prn.id, amount: prn.tonnage },
        registrationId: wasteRecords[0]?.registrationId,
        accreditationId: accreditation.id,
        organisationId: wasteRecords[0]?.organisationId
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
 *   organisationId: string
 * }>} events
 * @returns {import('../repository/stream-schema.js').StreamEventInsert[]}
 */
const replayStream = (events) => {
  const result = []
  let previousBalance = { ...ZERO_BALANCE }
  let previousCreditTotal = 0

  for (let i = 0; i < events.length; i++) {
    const { timestamp, kind, payload, ...context } = events[i]
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
      createdBy: { id: 'system', name: 'replay' }
    })

    previousBalance = closingBalance
  }

  return result
}

/**
 * Reconstruct the full historical event stream for an accreditation and
 * derive balance totals from it. The event list validates the stream
 * replay logic against authoritative sources; seeding these events into
 * a store requires further work (deterministic tiebreaks, partition
 * shape, createdBy attribution) tracked separately under PAE-1382.
 *
 * @param {Object} params
 * @param {{ id: string }} params.accreditation
 * @param {Array} params.wasteRecords
 * @param {Array} params.prns
 * @param {Object} params.overseasSites
 * @param {Array<{ id: string, status: string, submittedAt?: string }>} params.summaryLogs
 */
export const computeRebuiltStream = ({
  accreditation,
  wasteRecords,
  prns,
  overseasSites,
  summaryLogs
}) => {
  const unsorted = buildChronologicalEvents({
    accreditation,
    wasteRecords,
    prns,
    overseasSites,
    summaryLogs
  })

  unsorted.sort((a, b) => a.timestamp - b.timestamp)

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
