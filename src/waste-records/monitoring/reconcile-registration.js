import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { getWasteBalanceClassification } from '#waste-records-export/domain/is-included-in-waste-balance.js'

/**
 * The waste-record type of a row, however the source names it — waste record
 * states carry `wasteRecordType`, legacy waste-records carry `type`.
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

/**
 * Sum the tonnage the waste record states at the committed head contribute to
 * the balance — the included rows' stamped `transactionAmount`. Decomposability
 * (ADR-0037) means this must equal the head event's `creditTotal`.
 *
 * @param {import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState[]} wasteRecordStates
 * @returns {number}
 */
const wasteRecordStateCreditTotal = (wasteRecordStates) =>
  wasteRecordStates.reduce(
    (total, { classification }) =>
      classification.outcome === ROW_OUTCOME.INCLUDED
        ? toNumber(add(total, classification.transactionAmount))
        : total,
    0
  )

/**
 * The rows where the waste record state's inclusion decision disagrees with the
 * legacy waste-record's, each carrying the waste record state's classification
 * reasons so the divergence can be reviewed against expectations.
 *
 * @param {object} input
 * @param {import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState[]} input.wasteRecordStates
 * @param {Map<string, import('#domain/waste-records/model.js').WasteRecord>} input.committedByKey
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} input.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} input.overseasSites
 */
const classificationDivergencesBetween = ({
  wasteRecordStates,
  committedByKey,
  accreditation,
  overseasSites
}) =>
  wasteRecordStates.flatMap((wasteRecordState) => {
    const record = committedByKey.get(rowKey(wasteRecordState))
    if (record === undefined) {
      return []
    }
    const wasteRecordStateIncluded =
      wasteRecordState.classification.outcome === ROW_OUTCOME.INCLUDED
    const legacyClassification = getWasteBalanceClassification(
      record,
      accreditation,
      overseasSites
    )
    const legacyIncluded = legacyClassification?.included === true
    if (wasteRecordStateIncluded === legacyIncluded) {
      return []
    }
    return [
      {
        ...toRowRef(wasteRecordState),
        wasteRecordStateIncluded,
        legacyIncluded,
        reasons: wasteRecordState.classification.reasons
      }
    ]
  })

/**
 * Reconcile the waste record state collection (ADR-0037) against the legacy
 * waste-records committed baseline for a single registration ledger.
 * Read-only: every input is already loaded; this function only compares.
 *
 * The committed baseline is the carry-forward membership ADR-0037 defines: a
 * legacy row belongs to the committed state at the head when any of its versions
 * was committed — tagged with a summary-log id on the stream
 * (`committedSummaryLogIds`) — since row monotonicity keeps every submitted row
 * present through the latest head. Restated-unchanged rows carry no version at
 * the head, so a changed-at-head-only predicate would wrongly flag them as
 * extras; membership in the committed id set is what makes them reconcile.
 *
 * @param {Object} input
 * @param {string} input.registrationId
 * @param {string | null} input.accreditationId
 * @param {string | null} input.head
 * @param {Set<string>} input.committedSummaryLogIds
 * @param {number | null} input.eventCreditTotal
 * @param {import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState[]} input.wasteRecordStates
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} input.wasteRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} input.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} input.overseasSites
 */
export const reconcileRegistration = ({
  registrationId,
  accreditationId,
  head,
  committedSummaryLogIds,
  eventCreditTotal,
  wasteRecordStates,
  wasteRecords,
  accreditation,
  overseasSites
}) => {
  const hasCommittedSubmission = head !== null
  const hasWasteRecordStateData = wasteRecordStates.length > 0
  const committedRows = wasteRecords.filter((record) =>
    record.versions.some((version) =>
      committedSummaryLogIds.has(version.summaryLog.id)
    )
  )

  const wasteRecordStatesTotal = wasteRecordStateCreditTotal(wasteRecordStates)
  const eventTotal = eventCreditTotal ?? 0
  const drift = toNumber(add(wasteRecordStatesTotal, -eventTotal))

  const wasteRecordStateKeys = new Set(wasteRecordStates.map(rowKey))
  const committedByKey = new Map(
    committedRows.map((record) => [rowKey(record), record])
  )
  const missingRows = committedRows
    .filter((record) => !wasteRecordStateKeys.has(rowKey(record)))
    .map(toRowRef)
  const extraRows = wasteRecordStates
    .filter((wasteRecordState) => !committedByKey.has(rowKey(wasteRecordState)))
    .map(toRowRef)

  const classificationDivergences = classificationDivergencesBetween({
    wasteRecordStates,
    committedByKey,
    accreditation,
    overseasSites
  })

  return {
    registrationId,
    accreditationId,
    head,
    hasCommittedSubmission,
    hasWasteRecordStateData,
    wasteRecordStateCount: wasteRecordStates.length,
    committedRowCount: committedRows.length,
    creditTotal: {
      wasteRecordStates: wasteRecordStatesTotal,
      event: eventTotal,
      drift
    },
    missingRows,
    extraRows,
    classificationDivergences,
    isClean:
      (!hasCommittedSubmission || hasWasteRecordStateData) &&
      missingRows.length === 0 &&
      extraRows.length === 0 &&
      drift === 0
  }
}
