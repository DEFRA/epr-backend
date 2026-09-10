import { addRounded, toNumber } from '#common/helpers/decimal-utils.js'
import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import { indexAccreditations } from '#waste-balances/application/accreditation-index.js'
import { classifyRecordForWasteBalance } from '#waste-balances/domain/waste-balance-classification.js'
import { buildOverseasSitesContext } from '#waste-records-export/domain/overseas-sites-context.js'
import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'
import {
  addFigures,
  monthlyContribution,
  NO_FIGURES,
  withNetCredit
} from '#market-insights/domain/waste-balance-figures.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} SummaryLogRowStatesRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#overseas-sites/repository/port.js').OverseasSitesRepository} OverseasSitesRepository
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').WasteBalanceFigures} WasteBalanceFigures
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').PublishedWasteBalanceFigures} PublishedWasteBalanceFigures
 */

/**
 * A partition being published: the submission its figures are read at, the
 * registration whose material and processing type label them, and the
 * accreditation and overseas-site context its rows classify against, all
 * resolved once for the whole partition.
 *
 * @typedef {Object} PublishedPartition
 * @property {string} summaryLogId - the partition's latest submission
 * @property {import('#domain/organisations/registration.js').Registration} registration
 * @property {import('#domain/organisations/accreditation.js').Accreditation} accreditation
 * @property {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 */

/**
 * One published cell: the figures for one material, accreditation type and
 * reporting month, summed across every operator that reported into it.
 *
 * @typedef {Object} WasteBalanceCell
 * @property {string} material
 * @property {string} accreditationType
 * @property {string} month - `YYYY-MM`
 * @property {WasteBalanceFigures} figures
 */

/**
 * @typedef {{ material: string, accreditationType: string, month: string } & PublishedWasteBalanceFigures} WasteBalanceTableRow
 */

/**
 * @typedef {Object} WasteBalanceTable
 * @property {{ generatedAt: string, reportingYear: number }} meta
 * @property {WasteBalanceTableRow[]} data
 */

/**
 * @param {{ organisationId: string, registrationId: string, accreditationId: string | null }} ledgerId
 * @returns {string}
 */
const partitionKey = ({ organisationId, registrationId, accreditationId }) =>
  JSON.stringify([organisationId, registrationId, accreditationId])

/**
 * @param {WasteBalanceCell} cell
 * @returns {string}
 */
const cellKey = ({ material, accreditationType, month }) =>
  `${material}::${accreditationType}::${month}`

/**
 * @param {WasteBalanceTableRow} a
 * @param {WasteBalanceTableRow} b
 * @returns {number}
 */
const compareRows = (a, b) =>
  a.material.localeCompare(b.material) ||
  a.accreditationType.localeCompare(b.accreditationType) ||
  a.month.localeCompare(b.month)

/**
 * The partitions whose figures the publication sums, keyed by ledger identity:
 * every accredited partition with a submission, whose accreditation still
 * resolves to a live registration outside the test organisations. A
 * registered-only partition holds no credits, and can share a summary log with
 * an accredited one, so it is turned away here rather than by summary log.
 *
 * @param {import('#waste-balances/repository/ledger-port.js').LatestSubmittedSummaryLogPerLedger[]} entries
 * @param {Map<string, import('#waste-balances/application/accreditation-index.js').AccreditationContext>} index
 * @param {Map<string, import('#overseas-sites/repository/port.js').OverseasSite>} sitesById
 * @returns {Map<string, PublishedPartition>}
 */
const resolvePublishedPartitions = (entries, index, sitesById) => {
  /** @type {Map<string, PublishedPartition>} */
  const partitions = new Map()
  for (const { ledgerId, summaryLogId } of entries) {
    const { accreditationId } = ledgerId
    if (accreditationId === null) {
      continue
    }
    const context = index.get(accreditationId)
    if (context === undefined) {
      continue
    }
    partitions.set(partitionKey(ledgerId), {
      summaryLogId,
      registration: context.registration,
      accreditation: context.accreditation,
      overseasSites: buildOverseasSitesContext(context.registration, sitesById)
    })
  }
  return partitions
}

/**
 * Aggregate the published UK Waste Balance figures for a reporting year: the
 * gross credited tonnage, the tonnage eligible for the waste balance, the
 * sent-on deductions and the net credit, summed by material, accreditation type
 * and reporting month.
 *
 * The figures are the ones the service already computes. Each row's eligibility
 * is derived against today's accreditation and overseas-site data, as the
 * credited-tonnage report derives it, so approving an overseas site or amending
 * a validity period moves the publication without waiting for the operator to
 * submit again. The publication's own arithmetic is the sums and the net-credit
 * subtraction.
 *
 * The read is shaped for what the table prints: one indexed pass over every
 * published partition's rows, streamed so memory holds the cells rather than
 * the rows, and no per-accreditation figures built and then discarded.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {number} params.reportingYear
 * @param {Date} params.now - clock reading supplied by the caller
 * @returns {Promise<WasteBalanceTable>}
 */
export const buildWasteBalanceTable = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationsRepository,
  overseasSitesRepository,
  logger,
  reportingYear,
  now
}) => {
  const [entries, organisations, allSites] = await Promise.all([
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
    organisationsRepository.findAll(),
    overseasSitesRepository.findAll()
  ])

  const { index } = indexAccreditations(organisations)
  const partitions = resolvePublishedPartitions(
    entries,
    index,
    new Map(allSites.map((site) => [site.id, site]))
  )

  const summaryLogIds = entries
    .filter((entry) => partitions.has(partitionKey(entry.ledgerId)))
    .map((entry) => entry.summaryLogId)

  const monthPrefix = `${reportingYear}-`

  /** @type {Map<string, WasteBalanceCell>} */
  const cells = new Map()
  const undatedDeductions = { rowCount: 0, tonnage: 0 }

  for await (const rowState of summaryLogRowStatesRepository.streamRowStatesForSummaryLogs(
    summaryLogIds
  )) {
    const partition = partitions.get(partitionKey(rowState))
    if (partition === undefined) {
      continue
    }
    // A partition's earlier submissions match the stream's membership query too,
    // and a row the operator has since changed is a second document that still
    // carries the earlier submission. Reading each partition at its own latest
    // submission is what keeps a superseded row out of the sums.
    if (!rowState.summaryLogIds.includes(partition.summaryLogId)) {
      continue
    }

    const { registration, accreditation, overseasSites } = partition
    const classification = classifyRecordForWasteBalance(
      { type: rowState.wasteRecordType, data: rowState.data },
      rowState.processingType,
      accreditation,
      overseasSites
    )

    const contribution = monthlyContribution(
      { ...rowState, classification },
      {
        wasteProcessingType: /** @type {WasteProcessingTypeValue} */ (
          registration.wasteProcessingType
        ),
        reprocessingType: registration.reprocessingType
      }
    )
    if (contribution === null) {
      continue
    }
    if (contribution.month === null) {
      if (contribution.deducts) {
        undatedDeductions.rowCount += 1
        undatedDeductions.tonnage = toNumber(
          addRounded(
            undatedDeductions.tonnage,
            contribution.figures.sentOnDeductions,
            2
          )
        )
      }
      continue
    }
    if (!contribution.month.startsWith(monthPrefix)) {
      continue
    }

    const cell = {
      material: resolveDetailedMaterial(registration) ?? '',
      accreditationType: registration.wasteProcessingType,
      month: contribution.month,
      figures: contribution.figures
    }
    const key = cellKey(cell)
    const existing = cells.get(key)

    cells.set(key, {
      ...cell,
      figures: addFigures(existing?.figures ?? NO_FIGURES, contribution.figures)
    })
  }

  // A sent-on row's deduction is read straight from its own data: the sent-on
  // table declares no waste-balance classifier, so nothing upstream refuses a
  // row whose date cell is blank. Such a row leaves the deductions silently and
  // overstates the net credit the publication prints, so the publication says
  // how much it is missing.
  if (undatedDeductions.rowCount > 0) {
    logger.warn({
      message: `Market insights waste balance dropped ${undatedDeductions.rowCount} sent-on row(s) totalling ${undatedDeductions.tonnage} tonnes with no usable date, understating the deductions for reporting year ${reportingYear}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: 'market_insights_undated_sent_on_rows',
        reference: String(reportingYear)
      }
    })
  }

  const data = [...cells.values()]
    .map(({ figures, ...cell }) => ({ ...cell, ...withNetCredit(figures) }))
    .sort(compareRows)

  return {
    meta: { generatedAt: now.toISOString(), reportingYear },
    data
  }
}
