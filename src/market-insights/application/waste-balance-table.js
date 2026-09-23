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
import {
  countMonthlyReports,
  owedMonthlyReports
} from '#market-insights/application/monthly-reports.js'
import {
  operatorCountsOf,
  operatorsByFigure
} from '#market-insights/application/operator-counts.js'
import { recordOf } from '#common/helpers/record-of.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} SummaryLogRowStatesRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#overseas-sites/repository/port.js').OverseasSitesRepository} OverseasSitesRepository
 * @typedef {import('#reports/repository/port.js').ReportsRepository} ReportsRepository
 * @typedef {import('#market-insights/application/monthly-reports.js').ReportCount} ReportCount
 * @typedef {import('#common/helpers/dates/year-month.js').YearMonth} YearMonth
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').WasteBalanceFigures} WasteBalanceFigures
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').PublishedWasteBalanceFigures} PublishedWasteBalanceFigures
 * @typedef {import('#waste-balances/application/accreditation-index.js').AccreditationIndex} AccreditationIndex
 * @typedef {import('#waste-balances/repository/ledger-port.js').LatestSubmittedSummaryLogPerLedger} LatestSubmittedSummaryLogPerLedger
 * @typedef {import('#waste-records/repository/port.js').SubmittedRowState} SubmittedRowState
 * @typedef {import('#domain/organisations/registration.js').Registration} Registration
 * @typedef {import('#domain/organisations/model.js').Material} Material
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').MonthlyContribution} MonthlyContribution
 * @typedef {import('#domain/organisations/model.js').Organisation} Organisation
 * @typedef {import('#market-insights/application/operator-counts.js').Contribution} Contribution
 * @typedef {import('#market-insights/application/operator-counts.js').OperatorCounts} OperatorCounts
 * @typedef {import('#market-insights/application/operator-counts.js').OperatorsByFigure} OperatorsByFigure
 */

/**
 * @typedef {Object} PublishedPartition
 * @property {string} summaryLogId - the partition's latest submission
 * @property {Organisation} org
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
 * @typedef {Record<WasteProcessingTypeValue, PublishedWasteBalanceFigures & OperatorCounts>} FiguresByAccreditationType
 * @typedef {Record<Material, FiguresByAccreditationType>} FiguresByMaterial
 * @typedef {Record<Material, Record<WasteProcessingTypeValue, OperatorCounts>>} OperatorCountsByMaterial
 */

/**
 * One reporting month as published: the reports it was owed and how many of
 * them arrived, and the figures for every material and accreditation type.
 *
 * @typedef {Object} PublishedMonth
 * @property {ReportCount} reports
 * @property {FiguresByMaterial} figures
 */

/**
 * The whole period served: the reports it was owed and how many arrived, and
 * the operators behind each row's total across its months.
 *
 * @typedef {Object} PublishedPeriod
 * @property {ReportCount} reports
 * @property {OperatorCountsByMaterial} operatorCounts
 */

/**
 * @typedef {Object} WasteBalanceTable
 * @property {{ generatedAt: string }} meta
 * @property {{ months: Record<YearMonth, PublishedMonth>, period: PublishedPeriod }} data
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
 * @param {Pick<WasteBalanceCell, 'material' | 'accreditationType'>} row
 * @returns {string}
 */
const periodKey = ({ material, accreditationType }) =>
  `${material}::${accreditationType}`

/**
 * The cell a contribution counts towards, and its row's whole-period total. An
 * operator counts once in each, however many sites it reports from and
 * however many months it contributes to.
 *
 * @param {Contribution} contribution
 */
const figuresOf = ({ month, registration }) => {
  const row = {
    material: resolveMaterial(registration),
    accreditationType: registration.wasteProcessingType
  }
  return [cellKey({ ...row, month }), periodKey(row)]
}

/**
 * The operators behind each row's whole-period total, for every material and
 * accreditation type the publication prints.
 *
 * @param {OperatorsByFigure} operators
 * @returns {OperatorCountsByMaterial}
 */
const periodOperatorCounts = (operators) =>
  recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
    recordOf(Object.values(WASTE_PROCESSING_TYPE), (accreditationType) =>
      operatorCountsOf(operators, periodKey({ material, accreditationType }))
    )
  )

/**
 * The publication prints every material and accreditation type, so one
 * nothing reported into is still served, at zero.
 *
 * @param {Map<string, WasteBalanceCell>} cells
 * @param {OperatorsByFigure} operators
 * @param {YearMonth} month
 * @returns {FiguresByMaterial}
 */
const publishedFigures = (cells, operators, month) =>
  recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
    recordOf(Object.values(WASTE_PROCESSING_TYPE), (accreditationType) => {
      const key = cellKey({ material, accreditationType, month })
      return {
        ...withNetCredit(cells.get(key)?.figures ?? NO_FIGURES),
        ...operatorCountsOf(operators, key)
      }
    })
  )

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
      org: context.organisation,
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

  return contribution === null
    ? null
    : { org: partition.org, registration, contribution }
}

/**
 * @typedef {Object} PublishedRow
 * @property {Organisation} org
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
 * @typedef {Object} Aggregate
 * @property {Map<string, WasteBalanceCell>} cells
 * @property {Contribution[]} contributions - one per row the cells include
 * @property {UndatedTally} undated
 * @property {(month: string) => month is YearMonth} isPublishedMonth
 */

/**
 * @param {Aggregate} into
 * @param {PublishedRow} published
 */
const recordRow = (
  { cells, contributions, undated, isPublishedMonth },
  { org, registration, contribution }
) => {
  const { month, figures } = contribution
  if (month === null) {
    recordUndated(undated, contribution)
    return
  }
  if (isPublishedMonth(month)) {
    foldIntoCell(cells, registration, month, figures)
    contributions.push({ month, org, registration })
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
 * months, summed by material and accreditation type within each month. A row
 * dated outside those months is held back, which is what keeps a mis-keyed
 * future date from being published as supply. Each month also carries the
 * count of monthly reports it was owed and how many were submitted, and the
 * period carries the sum, which says how close the figures are to publication.
 * Every figure carries how many operators could have contributed to it, and
 * how many it includes tonnage from, and the period carries the same for each
 * row's total across its months.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @param {ReportsRepository} params.reportsRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {number} params.year - the reporting year
 * @param {YearMonth[]} params.months - the reporting months of that year to publish
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
  year,
  months,
  now
}) => {
  const [entries, organisations, allSites, periodicReports] = await Promise.all(
    [
      ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
      organisationsRepository.findAll(),
      overseasSitesRepository.findAll(),
      reportsRepository.findPeriodicReportsForYear({ year })
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

  /** @type {Set<string>} */
  const publishedMonths = new Set(months)
  /** @type {Aggregate} */
  const into = {
    cells: new Map(),
    contributions: [],
    undated: newUndatedTally(),
    isPublishedMonth: /** @returns {month is YearMonth} */ (month) =>
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

  const owedReports = [
    ...owedMonthlyReports({ organisations, periodicReports, months })
  ]
  const reports = countMonthlyReports(months, owedReports)
  const operators = operatorsByFigure(
    owedReports,
    into.contributions,
    figuresOf
  )

  return {
    meta: { generatedAt: now.toISOString() },
    data: {
      months: recordOf(months, (month) => ({
        reports: reports.byMonth[month],
        figures: publishedFigures(into.cells, operators, month)
      })),
      period: {
        reports: reports.total,
        operatorCounts: periodOperatorCounts(operators)
      }
    }
  }
}
