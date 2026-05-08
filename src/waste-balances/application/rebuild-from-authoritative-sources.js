import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#domain/organisations/accreditation.js').Accreditation} Accreditation
 * @typedef {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} OverseasSitesContext
 */

export const REBUILT_TRANSACTION_KIND = Object.freeze({
  SUMMARY_LOG_ROW: 'summary-log-row',
  PRN_CREATED: 'prn-created',
  PRN_ISSUED: 'prn-issued',
  PRN_CANCELLED_PRE_ISSUE: 'prn-cancelled-pre-issue',
  PRN_CANCELLED_POST_ISSUE: 'prn-cancelled-post-issue'
})

/**
 * @typedef {typeof REBUILT_TRANSACTION_KIND[keyof typeof REBUILT_TRANSACTION_KIND]} RebuiltTransactionKind
 */

/**
 * @typedef {{ amount: number, availableAmount: number }} BalanceSnapshot
 */

/**
 * @typedef {Object} RebuiltSummaryLogRowSource
 * @property {'summary-log-row'} kind
 * @property {string} wasteRecordType
 * @property {string} rowId
 * @property {string} versionId
 * @property {string} summaryLogId
 * @property {string} summaryLogUri
 */

/**
 * @typedef {Object} RebuiltPrnOperationSource
 * @property {'prn-operation'} kind
 * @property {string} prnId
 * @property {string|null} prnNumber
 * @property {Exclude<RebuiltTransactionKind, 'summary-log-row'>} operationType
 */

/**
 * @typedef {Object} RebuiltTransaction
 * @property {RebuiltTransactionKind} kind
 * @property {Date} at
 * @property {number} amount - Absolute magnitude of the change in totals
 * @property {BalanceSnapshot} openingBalance
 * @property {BalanceSnapshot} closingBalance
 * @property {{ id: string, name: string } | null} createdBy
 * @property {RebuiltSummaryLogRowSource | RebuiltPrnOperationSource} source
 */

/**
 * @typedef {Object} RebuildResult
 * @property {number} amount
 * @property {number} availableAmount
 * @property {RebuiltTransaction[]} transactions
 */

/** @type {BalanceSnapshot} */
const ZERO_BALANCE = Object.freeze({ amount: 0, availableAmount: 0 })

const PRN_DELTAS = Object.freeze({
  [REBUILT_TRANSACTION_KIND.PRN_CREATED]: (tonnage) => ({
    amount: 0,
    availableAmount: -tonnage
  }),
  [REBUILT_TRANSACTION_KIND.PRN_ISSUED]: (tonnage) => ({
    amount: -tonnage,
    availableAmount: 0
  }),
  [REBUILT_TRANSACTION_KIND.PRN_CANCELLED_PRE_ISSUE]: (tonnage) => ({
    amount: 0,
    availableAmount: tonnage
  }),
  [REBUILT_TRANSACTION_KIND.PRN_CANCELLED_POST_ISSUE]: (tonnage) => ({
    amount: tonnage,
    availableAmount: tonnage
  })
})

/**
 * @param {WasteRecord} record
 * @param {Accreditation} accreditation
 * @param {OverseasSitesContext} overseasSites
 * @returns {number}
 */
const targetAmountFor = (record, accreditation, overseasSites) => {
  if (record.excludedFromWasteBalance) {
    return 0
  }
  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )
  if (!schema?.classifyForWasteBalance) {
    return 0
  }
  const result = schema.classifyForWasteBalance(record.data, {
    accreditation,
    overseasSites
  })
  return result.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
}

const PRN_KIND_FROM_TRANSITION = (prevStatus, newStatus) => {
  if (newStatus === PRN_STATUS.AWAITING_AUTHORISATION) {
    return REBUILT_TRANSACTION_KIND.PRN_CREATED
  }
  if (
    newStatus === PRN_STATUS.AWAITING_ACCEPTANCE &&
    prevStatus === PRN_STATUS.AWAITING_AUTHORISATION
  ) {
    return REBUILT_TRANSACTION_KIND.PRN_ISSUED
  }
  if (
    (newStatus === PRN_STATUS.CANCELLED || newStatus === PRN_STATUS.DELETED) &&
    prevStatus === PRN_STATUS.AWAITING_AUTHORISATION
  ) {
    return REBUILT_TRANSACTION_KIND.PRN_CANCELLED_PRE_ISSUE
  }
  if (
    newStatus === PRN_STATUS.CANCELLED &&
    prevStatus === PRN_STATUS.AWAITING_CANCELLATION
  ) {
    return REBUILT_TRANSACTION_KIND.PRN_CANCELLED_POST_ISSUE
  }
  return null
}

/**
 * Iterate balance-affecting events from a PRN's status history without
 * materialising an array — yields the kind, timestamp, history entry, and
 * delta for each transition.
 *
 * @param {PackagingRecyclingNote} prn
 */
function* prnEventsOf(prn) {
  const history = prn.status.history
  for (let i = 0; i < history.length; i++) {
    const prevStatus = i === 0 ? null : history[i - 1].status
    const entry = history[i]
    const kind = PRN_KIND_FROM_TRANSITION(prevStatus, entry.status)
    if (!kind) {
      continue
    }
    yield {
      kind,
      entry,
      delta: PRN_DELTAS[kind](prn.tonnage)
    }
  }
}

/**
 * Compute totals only — no per-event allocation, no sort. The diagnostic
 * scans every embedded accreditation at startup and only needs the rebuilt
 * `amount` / `availableAmount` for divergence comparison; building the full
 * chronological transaction stream for thousands of waste records per
 * accreditation would be wasted work. The upfront sweep migration runner
 * (Defra-v4xtg.30) consumes the full `rebuildFromAuthoritativeSources` for
 * the chronological stream it persists via `appendToLedger`.
 *
 * @param {Object} params
 * @param {Accreditation} params.accreditation
 * @param {WasteRecord[]} params.wasteRecords
 * @param {PackagingRecyclingNote[]} params.prns
 * @param {OverseasSitesContext} params.overseasSites
 * @returns {{ amount: number, availableAmount: number }}
 */
export const computeRebuiltTotals = ({
  accreditation,
  wasteRecords,
  prns,
  overseasSites
}) => {
  let amount = 0
  let availableAmount = 0

  for (const record of wasteRecords) {
    const tonnage = targetAmountFor(record, accreditation, overseasSites)
    if (tonnage === 0) {
      continue
    }
    amount = toNumber(add(amount, tonnage))
    availableAmount = toNumber(add(availableAmount, tonnage))
  }

  for (const prn of prns) {
    for (const { delta } of prnEventsOf(prn)) {
      amount = toNumber(add(amount, delta.amount))
      availableAmount = toNumber(add(availableAmount, delta.availableAmount))
    }
  }

  return { amount, availableAmount }
}

const wasteRecordEvent = (record, accreditation, overseasSites) => {
  const tonnage = targetAmountFor(record, accreditation, overseasSites)
  if (tonnage === 0) {
    return null
  }
  const firstVersion = record.versions[0]
  const latestVersion = record.versions[record.versions.length - 1]
  return {
    kind: REBUILT_TRANSACTION_KIND.SUMMARY_LOG_ROW,
    at: new Date(firstVersion.createdAt),
    amount: tonnage,
    delta: { amount: tonnage, availableAmount: tonnage },
    createdBy: null,
    source: /** @type {RebuiltSummaryLogRowSource} */ ({
      kind: 'summary-log-row',
      wasteRecordType: record.type,
      rowId: String(record.rowId),
      versionId: latestVersion.id,
      summaryLogId: firstVersion.summaryLog.id,
      summaryLogUri: firstVersion.summaryLog.uri
    })
  }
}

const prnEvent = (prn, { kind, entry, delta }) => ({
  kind,
  at: new Date(entry.at),
  amount: prn.tonnage,
  delta,
  createdBy: { id: entry.by.id, name: entry.by.name },
  source: /** @type {RebuiltPrnOperationSource} */ ({
    kind: 'prn-operation',
    prnId: prn.id,
    prnNumber: prn.prnNumber ?? null,
    operationType: kind
  })
})

const eventSortKey = (event) =>
  event.source.kind === 'prn-operation'
    ? `prn:${event.source.prnId}:${event.source.operationType}`
    : `record:${event.source.wasteRecordType}:${event.source.rowId}`

const sortChronologically = (events) =>
  [...events].sort((a, b) => {
    const dt = a.at.getTime() - b.at.getTime()
    if (dt !== 0) {
      return dt
    }
    return eventSortKey(a).localeCompare(eventSortKey(b))
  })

/**
 * Rebuild a single accreditation's waste balance from authoritative sources —
 * waste records (credit contributions) and PRN status history (debit and
 * cancellation movements). Returns the rebuilt totals plus a chronological
 * transaction stream with chained opening/closing snapshots.
 *
 * The upfront sweep migration runner (rollout doc §Migration shape) consumes
 * the transaction stream to populate the ledger via `appendToLedger`. The
 * pre-cutover diagnostic uses the cheaper `computeRebuiltTotals` for totals
 * only; this function builds and sorts the full event list, which is wasted
 * work for accreditations with thousands of records.
 *
 * Authoritative-source rebuild — rather than embedded-transaction replay — is
 * required because embedded waste-record transactions key entities by naked
 * `rowId` and lose data under collisions (PAE-1364) and concurrency
 * duplication (PAE-1439).
 *
 * @param {Object} params
 * @param {Accreditation} params.accreditation
 * @param {WasteRecord[]} params.wasteRecords
 * @param {PackagingRecyclingNote[]} params.prns
 * @param {OverseasSitesContext} params.overseasSites
 * @returns {RebuildResult}
 */
export const rebuildFromAuthoritativeSources = ({
  accreditation,
  wasteRecords,
  prns,
  overseasSites
}) => {
  const events = []
  for (const record of wasteRecords) {
    const event = wasteRecordEvent(record, accreditation, overseasSites)
    if (event) {
      events.push(event)
    }
  }
  for (const prn of prns) {
    for (const op of prnEventsOf(prn)) {
      events.push(prnEvent(prn, op))
    }
  }

  const chronological = sortChronologically(events)
  let chain = ZERO_BALANCE
  const transactions = chronological.map((event) => {
    const closingBalance = {
      amount: toNumber(add(chain.amount, event.delta.amount)),
      availableAmount: toNumber(
        add(chain.availableAmount, event.delta.availableAmount)
      )
    }
    /** @type {RebuiltTransaction} */
    const transaction = {
      kind: event.kind,
      at: event.at,
      amount: event.amount,
      openingBalance: chain,
      closingBalance,
      createdBy: event.createdBy,
      source: event.source
    }
    chain = closingBalance
    return transaction
  })

  return {
    amount: chain.amount,
    availableAmount: chain.availableAmount,
    transactions
  }
}
