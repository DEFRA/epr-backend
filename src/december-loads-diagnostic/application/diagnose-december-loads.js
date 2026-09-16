import { processingTypeFor } from '#waste-balances/domain/credited-tonnage.js'
import { indexAccreditations } from '#waste-balances/application/accreditation-index.js'
import { decemberCreditTotalFor } from '#waste-balances/application/december-credit-total.js'
import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import { decemberKeyForYearOf } from '#common/helpers/dates/year-month.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} SummaryLogRowStatesRepository
 * @typedef {import('#waste-records/repository/schema.js').SummaryLogRowState} SummaryLogRowState
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#waste-balances/application/accreditation-index.js').AccreditationContext} AccreditationContext
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger
 */

/**
 * One flagged accreditation: its ledger December portion disagrees with the
 * December tonnage its current summary-log rows compute. `ledgerDecemberBalance` is
 * `null` when the latest closing balance carries no `decemberAmount` — a
 * pre-PAE-1920 submission that has not been resubmitted since, which is itself a
 * mismatch whenever expected December tonnage exists.
 *
 * @typedef {Object} DecemberLoadRow
 * @property {string} organisationId - internal id
 * @property {string} organisationReference - external org reference
 * @property {string} accreditationId
 * @property {string} accreditationNumber
 * @property {string} processingType
 * @property {string} decemberKey - `YYYY-12`
 * @property {number} summaryLogDecemberTonnage - December tonnage the current rows compute
 * @property {number | null} ledgerDecemberBalance - recorded December portion, `null` when absent
 */

/**
 * @typedef {Object} DecemberLoadsSummary
 * @property {number} scannedAccreditations - accredited submissions matched and scanned
 * @property {number} accreditationsWithDecemberBalance - scanned submissions with nonzero expected December tonnage
 * @property {number} mismatchedAccreditations - scanned submissions whose ledger December disagrees with expected
 */

/**
 * @typedef {Object} DecemberLoadsReport
 * @property {DecemberLoadRow[]} reports
 * @property {DecemberLoadsSummary} summary
 */

/**
 * @typedef {Object} AccreditationScan
 * @property {boolean} hasDecember - the current rows compute nonzero December tonnage
 * @property {DecemberLoadRow | null} row - a flagged row when ledger disagrees, else null
 */

/**
 * Sort flagged rows by organisation reference (numerically) then accreditation
 * id, so a diagnostic run reads in a stable order.
 *
 * @param {DecemberLoadRow} a
 * @param {DecemberLoadRow} b
 * @returns {number}
 */
const compareRows = (a, b) =>
  Number(a.organisationReference) - Number(b.organisationReference) ||
  a.accreditationId.localeCompare(b.accreditationId)

/**
 * Fold a stored row state's hoisted `processingType` back into its `data`, the
 * shape `decemberCreditTotalFor` reads it from. Storage lifts `processingType`
 * to a top-level field (project-summary-log-row-state.js), but the December
 * credit computation reads `data.processingType`, exactly as the write path fed
 * it — so the diagnostic reconstructs the ledger's figure faithfully.
 *
 * @param {SummaryLogRowState} rowState
 * @returns {SummaryLogRowState}
 */
const withProcessingTypeInData = (rowState) => ({
  ...rowState,
  data: { ...rowState.data, processingType: rowState.processingType }
})

/**
 * Compare one accreditation's ledger December portion against the December
 * tonnage its current submission's rows compute, reading its row states at the
 * submitted head. Returns nothing to flag when the rows compute no December
 * tonnage (the ledger is not read), and a flagged row only when the recorded
 * portion disagrees with what the rows compute.
 *
 * @param {Object} params
 * @param {AccreditationContext} params.context
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {string} params.summaryLogId
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @returns {Promise<AccreditationScan>}
 */
const scanAccreditation = async ({
  context,
  ledgerId,
  summaryLogId,
  summaryLogRowStatesRepository,
  ledgerRepository
}) => {
  const { organisation, registration, accreditation } = context
  const processingType = processingTypeFor({
    wasteProcessingType: /** @type {WasteProcessingTypeValue} */ (
      registration.wasteProcessingType
    ),
    reprocessingType: registration.reprocessingType
  })

  const rowStates =
    await summaryLogRowStatesRepository.findRowStatesForSummaryLog(
      ledgerId,
      summaryLogId
    )
  const summaryLogDecemberTonnage = decemberCreditTotalFor(
    rowStates.map(withProcessingTypeInData),
    accreditation
  )

  if (summaryLogDecemberTonnage === 0) {
    return { hasDecember: false, row: null }
  }

  const latest = await ledgerRepository.findLatestInLedger(ledgerId)
  const ledgerDecemberBalance = latest?.closingBalance.decemberAmount ?? null

  if (summaryLogDecemberTonnage === ledgerDecemberBalance) {
    return { hasDecember: true, row: null }
  }

  return {
    hasDecember: true,
    row: {
      organisationId: organisation.id,
      organisationReference: String(organisation.orgId),
      accreditationId: accreditation.id,
      accreditationNumber: accreditation.accreditationNumber ?? '',
      processingType,
      decemberKey: /** @type {string} */ (
        decemberKeyForYearOf(accreditation.validFrom)
      ),
      summaryLogDecemberTonnage,
      ledgerDecemberBalance
    }
  }
}

/**
 * Sweep every accreditation's latest submitted summary log and flag those whose
 * recorded ledger December portion disagrees with the December tonnage their
 * current rows compute. Read-only: it compares, it does not write. Only
 * accreditations that compute nonzero December tonnage are read against the
 * ledger; reprocessor-output submissions never accrue December, so they compute
 * nothing and are never flagged.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {TypedLogger} params.logger
 * @returns {Promise<DecemberLoadsReport>}
 */
export const buildDecemberLoadsReport = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationsRepository,
  logger
}) => {
  const [entries, organisations] = await Promise.all([
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
    organisationsRepository.findAll()
  ])

  const accreditedEntries = entries.filter(
    (entry) => entry.ledgerId.accreditationId !== null
  )
  const { index, testOrgAccreditationIds } = indexAccreditations(organisations)

  /** @type {DecemberLoadRow[]} */
  const reports = []
  let scannedAccreditations = 0
  let accreditationsWithDecemberBalance = 0

  for (const { ledgerId, summaryLogId } of accreditedEntries) {
    const accreditationId = /** @type {string} */ (ledgerId.accreditationId)
    const context = index.get(accreditationId)
    if (!context) {
      if (!testOrgAccreditationIds.has(accreditationId)) {
        logger.warn({
          message: `December loads diagnostic skipped a ledger entry with no matching accreditation: ${accreditationId}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: 'december_loads_ledger_entry_unmatched',
            reference: accreditationId
          }
        })
      }
      continue
    }

    scannedAccreditations += 1
    const { hasDecember, row } = await scanAccreditation({
      context,
      ledgerId,
      summaryLogId,
      summaryLogRowStatesRepository,
      ledgerRepository
    })
    if (hasDecember) {
      accreditationsWithDecemberBalance += 1
    }
    if (row) {
      reports.push(row)
    }
  }

  reports.sort(compareRows)

  return {
    reports,
    summary: {
      scannedAccreditations,
      accreditationsWithDecemberBalance,
      mismatchedAccreditations: reports.length
    }
  }
}
