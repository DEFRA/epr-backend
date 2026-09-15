import { addRounded, toNumber } from '#common/helpers/decimal-utils.js'
import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import { indexAccreditations } from '#waste-balances/application/accreditation-index.js'
import { classifyRecordForWasteBalance } from '#waste-balances/domain/waste-balance-classification.js'
import { buildOverseasSitesContext } from '#waste-records-export/domain/overseas-sites-context.js'
import { resolveMaterial } from '#domain/organisations/registration-utils.js'
import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  addFigures,
  monthlyContribution,
  NO_FIGURES,
  withNetCredit
} from '#market-insights/domain/waste-balance-figures.js'
import { countMonthlyReports } from '#market-insights/application/monthly-reports.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} SummaryLogRowStatesRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#overseas-sites/repository/port.js').OverseasSitesRepository} OverseasSitesRepository
 * @typedef {import('#reports/repository/port.js').ReportsRepository} ReportsRepository
 * @typedef {import('#market-insights/application/monthly-reports.js').MonthlyReportCount} MonthlyReportCount
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').WasteBalanceFigures} WasteBalanceFigures
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').PublishedWasteBalanceFigures} PublishedWasteBalanceFigures
 * @typedef {import('#waste-balances/application/accreditation-index.js').AccreditationIndex} AccreditationIndex
 * @typedef {import('#waste-balances/repository/ledger-port.js').LatestSubmittedSummaryLogPerLedger} LatestSubmittedSummaryLogPerLedger
 * @typedef {import('#waste-records/repository/port.js').SubmittedRowState} SubmittedRowState
 * @typedef {import('#domain/organisations/registration.js').Registration} Registration
 * @typedef {import('#domain/organisations/model.js').Material} Material
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').MonthlyContribution} MonthlyContribution
 */

/**
 * @typedef {Object} PublishedPartition
 * @property {string} summaryLogId - the partition's latest submission
 * @property {import('#domain/organisations/registration.js').Registration} registration
 * @property {import('#domain/organisations/accreditation.js').Accreditation} accreditation
 * @property {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 */

/**
 * The figures for one material, accreditation type and reporting month, summed
 * across every operator that reported into it.
 *
 * @typedef {Object} WasteBalanceCell
 * @property {Material} material
 * @property {string} accreditationType
 * @property {string} month - `YYYY-MM`
 * @property {WasteBalanceFigures} figures
 */

/**
 * @typedef {{ material: Material, accreditationType: string, month: string } & PublishedWasteBalanceFigures} WasteBalanceTableRow
 */

/**
 * @typedef {Object} WasteBalanceTable
 * @property {{ generatedAt: string, monthlyReports: MonthlyReportCount }} meta
 * @property {WasteBalanceTableRow[]} data
 */

/**
 * @param {{ organisationId: string, registrationId: string, accreditationId: string | null }} ledgerId
 * @returns {string}
 */
const partitionKey = ({ organisationId, registrationId, accreditationId }) =>
  JSON.stringify([organisationId, registrationId, accreditationId])

/**
 * @param {Pick<WasteBalanceCell, 'material' | 'accreditationType' | 'month'>} cell
 * @returns {string}
 */
const cellKey = ({ material, accreditationType, month }) =>
  `${material}::${accreditationType}::${month}`

/**
 * The publication prints every combination, so one nothing reported into is
 * still a row.
 *
 * @param {string[]} months
 * @returns {Pick<WasteBalanceCell, 'material' | 'accreditationType' | 'month'>[]}
 */
const publishedGrid = (months) =>
  TONNAGE_MONITORING_MATERIALS.flatMap((material) =>
    Object.values(WASTE_PROCESSING_TYPE).flatMap((accreditationType) =>
      months.map((month) => ({ material, accreditationType, month }))
    )
  )

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
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {string} accreditationId
 */
const warnAboutUnmatchedPartition = (logger, accreditationId) => {
  logger.warn({
    message: `Market insights waste balance left out a ledger partition whose accreditation no longer resolves: ${accreditationId}. Everything that partition reported is absent from the publication.`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: 'market_insights_partition_unmatched',
      reference: accreditationId
    }
  })
}

/**
 * @param {LatestSubmittedSummaryLogPerLedger[]} entries
 * @param {AccreditationIndex} accreditations
 * @param {Map<string, import('#overseas-sites/repository/port.js').OverseasSite>} sitesById
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @returns {Map<string, PublishedPartition>}
 */
const resolvePublishedPartitions = (
  entries,
  { index, testOrgAccreditationIds },
  sitesById,
  logger
) => {
  /** @type {Map<string, PublishedPartition>} */
  const partitions = new Map()
  for (const { ledgerId, summaryLogId } of entries) {
    const { accreditationId } = ledgerId
    if (accreditationId === null) {
      continue
    }
    const context = index.get(accreditationId)
    if (context === undefined) {
      if (!testOrgAccreditationIds.has(accreditationId)) {
        warnAboutUnmatchedPartition(logger, accreditationId)
      }
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
 * Eligibility is derived against today's accreditation and overseas-site data
 * rather than read from the classification stamped at submission.
 *
 * @param {SubmittedRowState} rowState
 * @param {Map<string, PublishedPartition>} partitions
 * @returns {PublishedRow | null}
 */
const publishedContribution = (rowState, partitions) => {
  const partition = partitions.get(partitionKey(rowState))
  if (partition === undefined) {
    return null
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

  return contribution === null ? null : { registration, contribution }
}

/**
 * @typedef {Object} PublishedRow
 * @property {Registration} registration
 * @property {MonthlyContribution} contribution
 */

/**
 * @param {Map<string, WasteBalanceCell>} cells
 * @param {Registration} registration
 * @param {string} month
 * @param {WasteBalanceFigures} figures
 */
const foldIntoCell = (cells, registration, month, figures) => {
  const cell = {
    material: resolveMaterial(registration),
    accreditationType: registration.wasteProcessingType,
    month
  }
  const key = cellKey(cell)

  cells.set(key, {
    ...cell,
    figures: addFigures(cells.get(key)?.figures ?? NO_FIGURES, figures)
  })
}

/**
 * @typedef {Object} UndatedTally
 * @property {{ rowCount: number, tonnage: number }} credits
 * @property {{ rowCount: number, tonnage: number }} deductions
 */

/** @returns {UndatedTally} */
const newUndatedTally = () => ({
  credits: { rowCount: 0, tonnage: 0 },
  deductions: { rowCount: 0, tonnage: 0 }
})

/**
 * @param {UndatedTally} undated
 * @param {import('#market-insights/domain/waste-balance-figures.js').MonthlyContribution} contribution
 */
const recordUndated = (undated, { deducts, figures }) => {
  const side = deducts ? undated.deductions : undated.credits
  const tonnage = deducts ? figures.sentOnDeductions : figures.totalCredited
  side.rowCount += 1
  side.tonnage = toNumber(addRounded(side.tonnage, tonnage, 2))
}

/**
 * @param {{ cells: Map<string, WasteBalanceCell>, undated: UndatedTally, isPublishedMonth: (month: string) => boolean }} into
 * @param {PublishedRow} published
 */
const recordRow = (
  { cells, undated, isPublishedMonth },
  { registration, contribution }
) => {
  const { month, figures } = contribution
  if (month === null) {
    recordUndated(undated, contribution)
    return
  }
  if (isPublishedMonth(month)) {
    foldIntoCell(cells, registration, month, figures)
  }
}

/**
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {UndatedTally} undated
 */
const warnAboutUndatedRows = (logger, { credits, deductions }) => {
  if (credits.rowCount + deductions.rowCount === 0) {
    return
  }
  logger.warn({
    message: `Market insights waste balance found ${deductions.rowCount} sent-on row(s) totalling ${deductions.tonnage} tonnes and ${credits.rowCount} crediting row(s) totalling ${credits.tonnage} tonnes with no usable date, understating the deductions and the gross credited tonnage of whichever month they belong to. A row with no date belongs to no reporting month, so this count spans every submission read rather than the months served alone.`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: 'market_insights_undated_rows'
    }
  })
}

/**
 * Aggregate the published UK Waste Balance figures for the given reporting
 * months, summed by material, accreditation type and reporting month. A row
 * dated outside those months is held back, which is what keeps a mis-keyed
 * future date from being published as supply. The count of monthly reports
 * owed and submitted across those months says how complete the figures are.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @param {ReportsRepository} params.reportsRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {string[]} params.months - the `YYYY-MM` reporting months to publish
 * @param {Date} params.now - clock reading supplied by the caller
 * @returns {Promise<WasteBalanceTable>}
 */
export const buildWasteBalanceTable = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationsRepository,
  overseasSitesRepository,
  reportsRepository,
  logger,
  months,
  now
}) => {
  const [entries, organisations, allSites, periodicReports] = await Promise.all(
    [
      ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
      organisationsRepository.findAll(),
      overseasSitesRepository.findAll(),
      reportsRepository.findAllPeriodicReports()
    ]
  )

  const partitions = resolvePublishedPartitions(
    entries,
    indexAccreditations(organisations),
    new Map(allSites.map((site) => [site.id, site])),
    logger
  )

  const summaryLogIds = entries
    .filter((entry) => partitions.has(partitionKey(entry.ledgerId)))
    .map((entry) => entry.summaryLogId)

  const publishedMonths = new Set(months)
  const into = {
    /** @type {Map<string, WasteBalanceCell>} */
    cells: new Map(),
    undated: newUndatedTally(),
    isPublishedMonth: (/** @type {string} */ month) =>
      publishedMonths.has(month)
  }

  for await (const rowState of summaryLogRowStatesRepository.streamRowStatesForSummaryLogs(
    summaryLogIds
  )) {
    const published = publishedContribution(rowState, partitions)
    if (published === null) {
      continue
    }
    recordRow(into, published)
  }

  warnAboutUndatedRows(logger, into.undated)

  const data = publishedGrid(months)
    .map((cell) => ({
      ...cell,
      ...withNetCredit(into.cells.get(cellKey(cell))?.figures ?? NO_FIGURES)
    }))
    .sort(compareRows)

  return {
    meta: {
      generatedAt: now.toISOString(),
      monthlyReports: countMonthlyReports({
        organisations,
        periodicReports,
        months,
        now
      })
    },
    data
  }
}
