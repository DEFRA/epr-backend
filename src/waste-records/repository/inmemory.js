import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { validateSummaryLogRowStateInsert } from './validation.js'

/**
 * In-memory implementation of the summary-log row state repository.
 *
 * Backed by a single array — for tests, fixtures, and contract verification.
 * Not durable, not concurrent-safe across processes. Excluded from the
 * production image by `.dockerignore`.
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowState} SummaryLogRowState
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowStateInsert} SummaryLogRowStateInsert
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowStateEntry} SummaryLogRowStateEntry
 */

/**
 * @typedef {import('./schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * @param {SummaryLogRowState} doc
 * @param {WasteBalanceLedgerId} ledgerId
 */
const matchesLedgerIdentity = (doc, ledgerId) =>
  doc.organisationId === ledgerId.organisationId &&
  doc.registrationId === ledgerId.registrationId &&
  doc.accreditationId === ledgerId.accreditationId

/**
 * @param {SummaryLogRowState} doc
 * @param {SummaryLogRowStateInsert} candidate
 */
const matchesRowIdentity = (doc, candidate) =>
  matchesLedgerIdentity(doc, candidate) &&
  doc.rowId === candidate.rowId &&
  doc.wasteRecordType === candidate.wasteRecordType

/**
 * @param {SummaryLogRowState} doc
 * @param {SummaryLogRowStateInsert} candidate
 */
const matchesCommittedState = (doc, candidate) =>
  matchesRowIdentity(doc, candidate) &&
  doc.processingType === candidate.processingType &&
  isDeepStrictEqual(doc.data, candidate.data) &&
  isDeepStrictEqual(doc.classification, candidate.classification)

/**
 * @param {SummaryLogRowState[]} storage
 * @param {WasteBalanceLedgerId} ledgerId
 * @param {string} summaryLogId
 * @returns {SummaryLogRowState[]}
 */
const rowStatesForSummaryLog = (storage, ledgerId, summaryLogId) =>
  structuredClone(
    storage.filter(
      (doc) =>
        matchesLedgerIdentity(doc, ledgerId) &&
        doc.summaryLogIds.includes(summaryLogId)
    )
  )

/**
 * @param {SummaryLogRowState[]} storage
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {string} fileId
 * @returns {SummaryLogRowState[]}
 */
const rowStatesForSummaryLogFile = (
  storage,
  organisationId,
  registrationId,
  fileId
) =>
  structuredClone(
    storage.filter(
      (doc) =>
        doc.organisationId === organisationId &&
        doc.registrationId === registrationId &&
        doc.summaryLogIds.includes(fileId)
    )
  )

/**
 * @param {SummaryLogRowState[]} storage
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {string} rowId
 * @param {string} wasteRecordType
 * @returns {SummaryLogRowState[]}
 */
const rowHistory = (
  storage,
  organisationId,
  registrationId,
  rowId,
  wasteRecordType
) =>
  structuredClone(
    storage.filter(
      (doc) =>
        doc.organisationId === organisationId &&
        doc.registrationId === registrationId &&
        doc.rowId === rowId &&
        doc.wasteRecordType === wasteRecordType
    )
  )

/**
 * @param {SummaryLogRowState[]} storage
 * @param {string[]} summaryLogIds
 * @returns {Generator<import('./port.js').SubmittedRowState>}
 */
function* submittedRowStatesForSummaryLogs(storage, summaryLogIds) {
  const asked = new Set(summaryLogIds)
  for (const doc of storage) {
    if (doc.summaryLogIds.some((id) => asked.has(id))) {
      yield structuredClone({
        organisationId: doc.organisationId,
        registrationId: doc.registrationId,
        accreditationId: doc.accreditationId,
        wasteRecordType: doc.wasteRecordType,
        processingType: doc.processingType,
        data: doc.data
      })
    }
  }
}

/**
 * @param {SummaryLogRowState[]} storage
 * @returns {string[]}
 */
const distinctDataKeys = (storage) => {
  const keys = new Set()
  for (const doc of storage) {
    for (const key of Object.keys(doc.data)) {
      keys.add(key)
    }
  }
  return [...keys]
}

/**
 * @param {SummaryLogRowState} doc
 * @returns {import('./port.js').WasteRecordStateProjection}
 */
const toWasteRecordStateProjection = ({
  rowId,
  wasteRecordType,
  processingType,
  data,
  classification
}) => ({ rowId, wasteRecordType, processingType, data, classification })

/**
 * @param {SummaryLogRowState[]} storage
 * @param {WasteBalanceLedgerId} ledgerId
 * @param {SummaryLogRowStateEntry} entry
 * @param {string} summaryLogId
 * @returns {SummaryLogRowState}
 */
const upsertOne = (storage, ledgerId, entry, summaryLogId) => {
  const candidate = validateSummaryLogRowStateInsert({
    organisationId: ledgerId.organisationId,
    registrationId: ledgerId.registrationId,
    accreditationId: ledgerId.accreditationId,
    wasteRecordType: entry.wasteRecordType,
    rowId: entry.rowId,
    processingType: entry.processingType,
    data: entry.data,
    classification: entry.classification,
    summaryLogIds: [summaryLogId]
  })

  const match = storage.find((doc) => matchesCommittedState(doc, candidate))

  if (match) {
    if (!match.summaryLogIds.includes(summaryLogId)) {
      match.summaryLogIds.push(summaryLogId)
    }
    return structuredClone(match)
  }

  const persisted = { id: randomUUID(), ...candidate }
  storage.push(persisted)
  return structuredClone(persisted)
}

/**
 * @param {SummaryLogRowState[]} storage
 * @returns {import('./port.js').SummaryLogRowStatesRepository}
 */
const repositoryOver = (storage) => ({
  /**
   * @param {WasteBalanceLedgerId} ledgerId
   * @param {SummaryLogRowStateEntry[]} summaryLogRowStates
   * @param {string} summaryLogId
   */
  upsertSummaryLogRowStates: async (
    ledgerId,
    summaryLogRowStates,
    summaryLogId
  ) =>
    summaryLogRowStates.map((entry) =>
      upsertOne(storage, ledgerId, entry, summaryLogId)
    ),

  /**
   * @param {WasteBalanceLedgerId} ledgerId
   * @param {string} summaryLogId
   */
  findRowStatesForSummaryLog: async (ledgerId, summaryLogId) =>
    rowStatesForSummaryLog(storage, ledgerId, summaryLogId),

  /**
   * @param {WasteBalanceLedgerId} ledgerId
   * @param {string} summaryLogId
   */
  findWasteRecordStatesForSummaryLog: async (ledgerId, summaryLogId) =>
    rowStatesForSummaryLog(storage, ledgerId, summaryLogId).map(
      toWasteRecordStateProjection
    ),

  /**
   * @param {string} organisationId
   * @param {string} registrationId
   * @param {string} fileId
   */
  findRowStatesForSummaryLogFile: async (
    organisationId,
    registrationId,
    fileId
  ) =>
    rowStatesForSummaryLogFile(storage, organisationId, registrationId, fileId),

  /**
   * @param {string} organisationId
   * @param {string} registrationId
   * @param {string} rowId
   * @param {string} wasteRecordType
   */
  findRowHistory: async (
    organisationId,
    registrationId,
    rowId,
    wasteRecordType
  ) =>
    rowHistory(storage, organisationId, registrationId, rowId, wasteRecordType),

  /**
   * @param {string[]} summaryLogIds
   */
  streamRowStatesForSummaryLogs: async function* (summaryLogIds) {
    yield* submittedRowStatesForSummaryLogs(storage, summaryLogIds)
  },

  findDistinctDataKeys: async () => distinctDataKeys(storage)
})

/**
 * @param {SummaryLogRowState[]} [initialSummaryLogRowStates]
 * @returns {import('./port.js').SummaryLogRowStatesRepositoryFactory}
 */
export const createInMemorySummaryLogRowStatesRepository = (
  initialSummaryLogRowStates = []
) => {
  const storage = initialSummaryLogRowStates

  return () => repositoryOver(storage)
}
