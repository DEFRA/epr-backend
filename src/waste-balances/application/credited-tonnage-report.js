import { creditedTonnageByMonth } from '#waste-balances/domain/credited-tonnage.js'
import { reclassifyWasteRecordStates } from '#waste-records/application/reclassify-waste-record-states.js'
import { toWasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
import { buildOverseasSitesContext } from '#waste-records-export/domain/overseas-sites-context.js'
import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'
import { indexAccreditations } from '#waste-balances/application/accreditation-index.js'
import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import { monthKeyForDate } from '#common/helpers/dates/year-month.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} SummaryLogRowStatesRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#overseas-sites/repository/port.js').OverseasSitesRepository} OverseasSitesRepository
 * @typedef {import('#domain/organisations/model.js').Organisation} Organisation
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger
 */

/**
 * The report covers a fixed window: January 2026 (the first reporting month)
 * through the current month, as of generation. "Current month" is the
 * Europe/London calendar month — consistent with the project's month-boundary
 * decisions — so a submission just before UK midnight at a month end lands in
 * the month the operator sees, not the UTC one. Row dates themselves are
 * date-only strings bucketed in UTC by the domain, and are unaffected.
 */
const REPORT_START_MONTH = '2026-01'

const REPORT_TIME_ZONE = 'Europe/London'

/**
 * A single flat row of the report — one accreditation in one month.
 *
 * The material is empty for a registration that has resolved to none, so a
 * record the split never reached shows up uncounted against any material
 * rather than counted against half of what it is.
 *
 * @typedef {Object} CreditedTonnageRow
 * @property {string} month - `YYYY-MM`
 * @property {{ id: string, reference: string }} organisation - internal id and external reference
 * @property {{ id: string, accreditationNumber: string, processingType: string, material: string }} accreditation
 * @property {{ totalCredited: number, eligibleForWasteBalance: number, sentOnDeductions: number }} tonnage
 */

/**
 * The report payload: generation metadata and the flat, sorted rows.
 *
 * @typedef {Object} CreditedTonnageReport
 * @property {{ generatedAt: string }} meta
 * @property {CreditedTonnageRow[]} data
 */

/**
 * Sort rows by material, then processing type, then organisation reference
 * (numerically), then accreditation (so one accreditation's months stay
 * contiguous), then month ascending.
 *
 * @param {CreditedTonnageRow} a
 * @param {CreditedTonnageRow} b
 * @returns {number}
 */
const compareRows = (a, b) =>
  a.accreditation.material.localeCompare(b.accreditation.material) ||
  a.accreditation.processingType.localeCompare(
    b.accreditation.processingType
  ) ||
  Number(a.organisation.reference) - Number(b.organisation.reference) ||
  a.accreditation.id.localeCompare(b.accreditation.id) ||
  a.month.localeCompare(b.month)

/**
 * Build the credited-tonnage report: one row per accredited-partition per month
 * (January 2026 → the month of `now`, zero-filled) derived from each
 * accreditation's latest submitted summary log.
 *
 * The ledger query yields one entry per accredited partition with a submission,
 * so accreditations with no submission never appear. Each entry's row states are
 * read at that submission's head, classified against today's accreditation and
 * overseas-site data rather than the reading stamped at submission, and
 * aggregated by the pure domain function; the organisation join attaches the
 * external reference, accreditation number, processing type and effective
 * material, and drops test organisations. Rows dropped for a bad
 * month-assignment date are counted per accreditation in a structured log line.
 *
 * This report answers what an accreditation has credited as of now, so
 * approving an overseas site or amending a validity period must move the
 * figures without waiting for the operator to submit again.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @param {TypedLogger} params.logger
 * @param {Date} params.now - clock reading supplied by the caller; the report's upper month bound
 * @returns {Promise<CreditedTonnageReport>}
 */
/**
 * The two tonnage figures on one population of skipped rows, for the log line.
 * Both are given because they routinely differ: a row dated before the
 * reporting window is usually outside its accreditation period as well, so it
 * carries a crediting column the report loses while the waste balance holds
 * nothing for it. Only the eligible figure is tonnage anyone could recover.
 *
 * @param {import('#waste-balances/domain/credited-tonnage.js').SkippedRowTally} tally
 * @returns {string}
 */
const describeTonnage = ({ totalCredited, eligibleForWasteBalance }) =>
  `(${totalCredited}t credited, ${eligibleForWasteBalance}t eligible)`

export const buildCreditedTonnageReport = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationsRepository,
  overseasSitesRepository,
  logger,
  now
}) => {
  const monthRange = {
    fromMonth: REPORT_START_MONTH,
    toMonth: /** @type {string} */ (monthKeyForDate(now, REPORT_TIME_ZONE))
  }

  const [entries, organisations, allSites] = await Promise.all([
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
    organisationsRepository.findAll(),
    overseasSitesRepository.findAll()
  ])

  const sitesById = new Map(allSites.map((site) => [site.id, site]))

  // Credits only exist for accredited partitions; registered-only entries
  // (accreditationId null) carry zero-delta submissions and never appear in
  // this report.
  const creditedEntries = entries.filter(
    (entry) => entry.ledgerId.accreditationId !== null
  )

  const { index, testOrgAccreditationIds } = indexAccreditations(organisations)

  /** @type {CreditedTonnageRow[]} */
  const rows = []

  for (const { ledgerId, summaryLogId } of creditedEntries) {
    // creditedEntries holds accredited partitions only, so `accreditationId`
    // is non-null here despite the ledger id's wider type.
    const accreditationId = /** @type {string} */ (ledgerId.accreditationId)
    const context = index.get(accreditationId)
    if (!context) {
      if (!testOrgAccreditationIds.has(accreditationId)) {
        logger.warn({
          message: `Credited tonnage report skipped a ledger entry with no matching accreditation: ${accreditationId}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: 'credited_tonnage_ledger_entry_unmatched',
            reference: accreditationId
          }
        })
      }
      continue
    }

    const { organisation, registration, accreditation } = context

    const storedRowStates =
      await summaryLogRowStatesRepository.findRowStatesForSummaryLog(
        ledgerId,
        summaryLogId
      )
    const rowStates = reclassifyWasteRecordStates(
      storedRowStates.map(toWasteRecordState),
      {
        accreditation,
        overseasSites: buildOverseasSitesContext(registration, sitesById)
      }
    )

    const { months, skippedRows } = creditedTonnageByMonth(
      rowStates,
      {
        wasteProcessingType: /** @type {WasteProcessingTypeValue} */ (
          registration.wasteProcessingType
        ),
        reprocessingType: registration.reprocessingType
      },
      monthRange
    )

    const { noUsableDate, beforeWindowStart, afterWindowEnd } = skippedRows
    const skippedTotal =
      noUsableDate.rowCount +
      beforeWindowStart.rowCount +
      afterWindowEnd.rowCount

    if (skippedTotal > 0) {
      logger.info({
        message:
          `Credited tonnage report skipped ${skippedTotal} row(s) for accreditation ${accreditation.id}: ` +
          `${noUsableDate.rowCount} with no usable date ${describeTonnage(noUsableDate)}, ` +
          `${beforeWindowStart.rowCount} dated before ${monthRange.fromMonth} ${describeTonnage(beforeWindowStart)}, ` +
          `${afterWindowEnd.rowCount} dated after ${monthRange.toMonth} ${describeTonnage(afterWindowEnd)}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: 'credited_tonnage_rows_skipped',
          reference: accreditation.id
        }
      })
    }

    const material = resolveDetailedMaterial(registration) ?? ''
    const reference = String(organisation.orgId)
    const accreditationNumber = accreditation.accreditationNumber ?? ''

    for (const month of months) {
      rows.push({
        month: month.month,
        organisation: { id: organisation.id, reference },
        accreditation: {
          id: accreditation.id,
          accreditationNumber,
          processingType: registration.wasteProcessingType,
          material
        },
        tonnage: {
          totalCredited: month.totalCredited,
          eligibleForWasteBalance: month.eligibleForWasteBalance,
          sentOnDeductions: month.sentOnDeductions
        }
      })
    }
  }

  rows.sort(compareRows)

  return { meta: { generatedAt: now.toISOString() }, data: rows }
}
