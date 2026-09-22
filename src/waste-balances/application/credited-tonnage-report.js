import { creditedTonnageByMonth } from '#waste-balances/domain/credited-tonnage.js'
import { reclassifyWasteRecordStates } from '#waste-records/application/reclassify-waste-record-states.js'
import { toWasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
import { buildOverseasSitesContext } from '#waste-records-export/domain/overseas-sites-context.js'
import { resolveMaterial } from '#domain/organisations/registration-utils.js'
import { indexAccreditations } from '#waste-balances/application/accreditation-index.js'
import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import { monthKeyForDate } from '#common/helpers/dates/year-month.js'
import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { mapWithConcurrency } from '#common/helpers/map-with-concurrency.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} SummaryLogRowStatesRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#overseas-sites/repository/port.js').OverseasSitesRepository} OverseasSitesRepository
 * @typedef {import('#overseas-sites/repository/port.js').OverseasSite} OverseasSite
 * @typedef {import('#domain/organisations/model.js').Material} Material
 * @typedef {import('#domain/organisations/model.js').Organisation} Organisation
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger
 * @typedef {import('#waste-balances/application/accreditation-index.js').AccreditationContext} AccreditationContext
 * @typedef {import('#waste-balances/repository/ledger-port.js').LatestSubmittedSummaryLogPerLedger} LedgerEntry
 * @typedef {import('#waste-balances/domain/credited-tonnage.js').MonthRange} MonthRange
 * @typedef {import('#waste-balances/domain/credited-tonnage.js').SkippedRows} SkippedRows
 */

/**
 * The shared inputs each ledger entry is processed against. Passed to
 * {@link buildRowsForEntry} so entries can be handled concurrently without
 * threading each dependency through separately.
 *
 * @typedef {Object} EntryContext
 * @property {Map<string, AccreditationContext>} index
 * @property {Set<string>} testOrgAccreditationIds
 * @property {SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {Map<string, OverseasSite>} sitesById
 * @property {MonthRange} monthRange
 * @property {TypedLogger} logger
 */

/**
 * How many summary-log row-state reads to keep in flight at once. Each accredited
 * partition needs one Mongo round-trip, and reading them serially was the
 * dominant cost of the report (roughly 35s over ~1360 partitions). A modest cap
 * bounds the load on Mongo while collapsing the wall-clock to a fraction.
 */
const ROW_STATE_READ_CONCURRENCY = 10

/**
 * The report covers a fixed window: January 2026 (the first reporting month)
 * through the current month, as of generation. "Current month" is the
 * Europe/London calendar month — consistent with the project's month-boundary
 * decisions — so a submission just before UK midnight at a month end lands in
 * the month the operator sees, not the UTC one. Row dates themselves are
 * date-only strings bucketed in UTC by the domain, and are unaffected.
 */
const REPORT_START_MONTH = '2026-01'

/**
 * A single flat row of the report — one accreditation in one month.
 *
 * @typedef {Object} CreditedTonnageRow
 * @property {string} month - `YYYY-MM`
 * @property {{ id: string, reference: string }} organisation - internal id and external reference
 * @property {{ id: string, accreditationNumber: string, processingType: string, material: Material }} accreditation
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

/**
 * Warn that a ledger entry named an accreditation absent from the organisation
 * data. Test-org accreditations are dropped by design and never reach here.
 *
 * @param {TypedLogger} logger
 * @param {string} accreditationId
 */
const warnUnmatchedAccreditation = (logger, accreditationId) => {
  logger.warn({
    message: `Credited tonnage report skipped a ledger entry with no matching accreditation: ${accreditationId}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: 'credited_tonnage_ledger_entry_unmatched',
      reference: accreditationId
    }
  })
}

/**
 * Log one structured line per accreditation whose rows could not all be placed,
 * split by why. Silent when nothing was skipped.
 *
 * @param {TypedLogger} logger
 * @param {string} accreditationId
 * @param {SkippedRows} skippedRows
 * @param {MonthRange} monthRange
 */
const logSkippedRows = (logger, accreditationId, skippedRows, monthRange) => {
  const { noUsableDate, beforeWindowStart, afterWindowEnd } = skippedRows
  const skippedTotal =
    noUsableDate.rowCount + beforeWindowStart.rowCount + afterWindowEnd.rowCount

  if (skippedTotal === 0) {
    return
  }

  logger.info({
    message:
      `Credited tonnage report skipped ${skippedTotal} row(s) for accreditation ${accreditationId}: ` +
      `${noUsableDate.rowCount} with no usable date ${describeTonnage(noUsableDate)}, ` +
      `${beforeWindowStart.rowCount} dated before ${monthRange.fromMonth} ${describeTonnage(beforeWindowStart)}, ` +
      `${afterWindowEnd.rowCount} dated after ${monthRange.toMonth} ${describeTonnage(afterWindowEnd)}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: 'credited_tonnage_rows_skipped',
      reference: accreditationId
    }
  })
}

/**
 * Build the report rows for one accredited-partition ledger entry: read its row
 * states at the submission head, reclassify against today's accreditation and
 * overseas-site data, aggregate by month and emit one row per month. An entry
 * whose accreditation is missing yields no rows (and warns unless it is a
 * dropped test org). Called once per entry, safe to run concurrently: it only
 * reads shared state and its own side effects are the two log lines.
 *
 * @param {LedgerEntry} entry
 * @param {EntryContext} context
 * @returns {Promise<CreditedTonnageRow[]>}
 */
const buildRowsForEntry = async (
  { ledgerId, summaryLogId },
  {
    index,
    testOrgAccreditationIds,
    summaryLogRowStatesRepository,
    sitesById,
    monthRange,
    logger
  }
) => {
  // creditedEntries holds accredited partitions only, so `accreditationId`
  // is non-null here despite the ledger id's wider type.
  const accreditationId = /** @type {string} */ (ledgerId.accreditationId)
  const entryContext = index.get(accreditationId)
  if (!entryContext) {
    if (!testOrgAccreditationIds.has(accreditationId)) {
      warnUnmatchedAccreditation(logger, accreditationId)
    }
    return []
  }

  const { organisation, registration, accreditation } = entryContext

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

  logSkippedRows(logger, accreditation.id, skippedRows, monthRange)

  const material = resolveMaterial(registration)
  const reference = String(organisation.orgId)
  const accreditationNumber = accreditation.accreditationNumber ?? ''

  return months.map((month) => ({
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
  }))
}

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
    toMonth: /** @type {string} */ (monthKeyForDate(now, UK_TIME_ZONE))
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

  // Each entry's row states are read with one Mongo round-trip. Reading them
  // serially dominated the response time, so the reads run through a
  // bounded-concurrency pool. The final `rows.sort(compareRows)` imposes a
  // total order, so the order entries settle in does not affect the output.
  const rowsPerEntry = await mapWithConcurrency(
    creditedEntries,
    ROW_STATE_READ_CONCURRENCY,
    (entry) =>
      buildRowsForEntry(entry, {
        index,
        testOrgAccreditationIds,
        summaryLogRowStatesRepository,
        sitesById,
        monthRange,
        logger
      })
  )

  const rows = rowsPerEntry.flat()
  rows.sort(compareRows)

  return { meta: { generatedAt: now.toISOString() }, data: rows }
}
