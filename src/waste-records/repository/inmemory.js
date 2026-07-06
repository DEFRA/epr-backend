import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { validateSummaryLogRowStateInsert } from './validation.js'

/**
 * In-memory adapter for summary-log row states.
 *
 * Backed by a single array — fine for tests, fixtures, and contract
 * verification. Not durable, not concurrent-safe across processes.
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
 * @param {SummaryLogRowStateInsert} candidate
 */
const matchesRowIdentity = (doc, candidate) =>
  doc.organisationId === candidate.organisationId &&
  doc.registrationId === candidate.registrationId &&
  doc.accreditationId === candidate.accreditationId &&
  doc.rowId === candidate.rowId &&
  doc.wasteRecordType === candidate.wasteRecordType

/**
 * @param {SummaryLogRowState} doc
 * @param {SummaryLogRowStateInsert} candidate
 */
const matchesCommittedState = (doc, candidate) =>
  matchesRowIdentity(doc, candidate) &&
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

    /** @param {string} summaryLogId */
    findBySummaryLogId: async (summaryLogId) =>
      structuredClone(
        storage.filter((doc) => doc.summaryLogIds.includes(summaryLogId))
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
      )
  })
}
