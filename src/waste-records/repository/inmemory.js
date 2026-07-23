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
 * @param {SummaryLogRowState[]} [initialSummaryLogRowStates]
 * @returns {import('./port.js').SummaryLogRowStateRepositoryFactory}
 */
export const createInMemorySummaryLogRowStateRepository = (
  initialSummaryLogRowStates = []
) => {
  const storage = initialSummaryLogRowStates

  return () => ({
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
      structuredClone(
        storage.filter(
          (doc) =>
            matchesLedgerIdentity(doc, ledgerId) &&
            doc.summaryLogIds.includes(summaryLogId)
        )
      ),

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
      structuredClone(
        storage.filter(
          (doc) =>
            doc.organisationId === organisationId &&
            doc.registrationId === registrationId &&
            doc.rowId === rowId &&
            doc.wasteRecordType === wasteRecordType
        )
      ),

    findDistinctDataKeys: async () => {
      const keys = new Set()
      for (const doc of storage) {
        for (const key of Object.keys(doc.data)) {
          keys.add(key)
        }
      }
      return [...keys]
    }
  })
}
