import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { isIncludedInWasteBalance } from '#waste-records-export/domain/is-included-in-waste-balance.js'

/**
 * Sum the tonnage the row-states at the committed head contribute to the
 * balance — the included rows' stamped `transactionAmount`. Decomposability
 * (ADR-0037) means this must equal the head event's `creditTotal`.
 *
 * @param {import('#waste-records/application/read-waste-record-states.js').WasteRecordState[]} rowStates
 * @returns {number}
 */
/**
 * The waste-record type of a row, however the source names it — row-states
 * carry `wasteRecordType`, legacy waste-records carry `type`.
 *
 * @param {{ wasteRecordType?: string, type?: string }} row
 * @returns {string | undefined}
 */
const typeOf = (row) => row.wasteRecordType ?? row.type

/**
 * Identity key for a row across both collections: its type and rowId.
 *
 * @param {{ rowId: string, wasteRecordType?: string, type?: string }} row
 * @returns {string}
 */
const rowKey = (row) => `${typeOf(row)}::${row.rowId}`

/**
 * Normalise a row from either collection to a stable `(rowId, wasteRecordType)`
 * reference for discrepancy listings.
 *
 * @param {{ rowId: string, wasteRecordType?: string, type?: string }} row
 * @returns {{ rowId: string, wasteRecordType: string | undefined }}
 */
const toRowRef = (row) => ({ rowId: row.rowId, wasteRecordType: typeOf(row) })

const rowStateCreditTotal = (rowStates) =>
  rowStates.reduce(
    (total, { classification }) =>
      classification.outcome === ROW_OUTCOME.INCLUDED
        ? toNumber(add(total, classification.transactionAmount))
        : total,
    0
  )

/**
 * Reconcile the committed row-state collection against the legacy waste-records
 * read for a single registration partition. Read-only: every input is already
 * loaded; this function only compares.
 *
 * @param {Object} input
 * @param {string} input.registrationId
 * @param {string | null} input.accreditationId
 * @param {string | null} input.head
 * @param {number | null} input.eventCreditTotal
 * @param {import('#waste-records/application/read-waste-record-states.js').WasteRecordState[]} input.rowStates
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} input.wasteRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} input.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} input.overseasSites
 */
export const reconcileRegistration = ({
  registrationId,
  accreditationId,
  head,
  eventCreditTotal,
  rowStates,
  wasteRecords,
  accreditation,
  overseasSites
}) => {
  const hasCommittedSubmission = head !== null
  const hasRowStateData = rowStates.length > 0
  const committedRows = wasteRecords.filter((record) =>
    record.versions.some((version) => version.summaryLog.id === head)
  )

  const rowStatesTotal = rowStateCreditTotal(rowStates)
  const eventTotal = eventCreditTotal ?? 0
  const drift = toNumber(add(rowStatesTotal, -eventTotal))

  const rowStateKeys = new Set(rowStates.map(rowKey))
  const committedByKey = new Map(
    committedRows.map((record) => [rowKey(record), record])
  )
  const missingRows = committedRows
    .filter((record) => !rowStateKeys.has(rowKey(record)))
    .map(toRowRef)
  const extraRows = rowStates
    .filter((rowState) => !committedByKey.has(rowKey(rowState)))
    .map(toRowRef)

  const classificationDivergences = rowStates.flatMap((rowState) => {
    const record = committedByKey.get(rowKey(rowState))
    if (record === undefined) {
      return []
    }
    const rowStateIncluded =
      rowState.classification.outcome === ROW_OUTCOME.INCLUDED
    const legacyIncluded = isIncludedInWasteBalance(
      record,
      accreditation,
      overseasSites
    )
    if (rowStateIncluded === legacyIncluded) {
      return []
    }
    return [{ ...toRowRef(rowState), rowStateIncluded, legacyIncluded }]
  })

  return {
    registrationId,
    accreditationId,
    head,
    hasCommittedSubmission,
    hasRowStateData,
    rowStateCount: rowStates.length,
    committedRowCount: committedRows.length,
    creditTotal: { rowStates: rowStatesTotal, event: eventTotal, drift },
    missingRows,
    extraRows,
    classificationDivergences,
    isClean:
      (!hasCommittedSubmission || hasRowStateData) &&
      missingRows.length === 0 &&
      extraRows.length === 0 &&
      drift === 0
  }
}
