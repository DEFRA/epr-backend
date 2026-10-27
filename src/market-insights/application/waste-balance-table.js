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
import { accreditedMonths } from '#market-insights/application/accredited-months.js'
import {
  operatorCountsOf,
  operatorsByFigure
} from '#market-insights/application/operator-counts.js'
import { recordOf } from '#common/helpers/record-of.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Material, Organisation, WasteProcessingTypeValue } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { OverseasSitesContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import { ReportCount } from '#market-insights/application/monthly-reports.js' */
/** @import { Contribution, OperatorCounts, OperatorsByFigure } from '#market-insights/application/operator-counts.js' */
/** @import { MonthlyContribution, PublishedWasteBalanceFigures, WasteBalanceFigures } from '#market-insights/domain/waste-balance-figures.js' */
/** @import { OverseasSite, OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { ReportsRepository } from '#reports/repository/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { AccreditationIndex } from '#waste-balances/application/accreditation-index.js' */
/** @import { LatestSubmittedSummaryLogPerLedger, WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { SubmittedRowState, SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */

/**
 * @typedef {Object} PublishedPartition
 * @property {string} summaryLogId - the partition's latest submission
 * @property {Organisation} org
 * @property {Registration} registration
 * @property {Accreditation} accreditation
 * @property {OverseasSitesContext} overseasSites
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
 * @typedef {Record<Material, Record<WasteProcessingTypeValue, PublishedWasteBalanceFigures>>} PeriodFiguresByMaterial
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
 * The whole period served: the reports it was owed and how many arrived, each
 * row's total across its months, and the operators behind that total.
 *
 * @typedef {Object} PublishedPeriod
 * @property {ReportCount} reports
 * @property {PeriodFiguresByMaterial} figures
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
 * Each row's figures summed across the months served, so a reader of the
 * period never adds them up itself.
 *
 * @param {Map<string, WasteBalanceCell>} cells
 * @param {YearMonth[]} months
 * @returns {PeriodFiguresByMaterial}
 */
const periodFigures = (cells, months) =>
  recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
    recordOf(Object.values(WASTE_PROCESSING_TYPE), (accreditationType) =>
      withNetCredit(
        months
          .map(
            (month) =>
              cells.get(cellKey({ material, accreditationType, month }))
                ?.figures ?? NO_FIGURES
          )
          .reduce((sum, figures) => addFigures(sum, figures), NO_FIGURES)
      )
    )
  )

/**
 * @param {TypedLogger} logger
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
 * @param {Map<string, OverseasSite>} sitesById
 * @param {TypedLogger} logger
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
 * @param {MonthlyContribution} contribution
 */
const recordUndated = (undated, { deducts, figures }) => {
  const side = deducts ? undated.deductions : undated.credits
  const tonnage = deducts ? figures.sentOnDeductions : figures.totalCredited
  side.rowCount += 1
  side.tonnage = toNumber(addRounded(side.tonnage, tonnage, 2))
}

/**
 * Net credit is the only figure published, so an operator's tonnage is in it
 * only where it is eligible or deducted as sent on.
 *
 * @param {WasteBalanceFigures} figures
 */
const movesNetCredit = ({ eligibleForWasteBalance, sentOnDeductions }) =>
  eligibleForWasteBalance !== 0 || sentOnDeductions !== 0

/**
 * @typedef {Object} Aggregate
 * @property {Map<string, WasteBalanceCell>} cells
 * @property {Map<string, Contribution>} contributions - one per registration and month whose tonnage the net credit includes
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
  if (!isPublishedMonth(month)) {
    return
  }
  foldIntoCell(cells, registration, month, figures)
  if (movesNetCredit(figures)) {
    contributions.set(`${registration.id}::${month}`, {
      month,
      org,
      registration
    })
  }
}

/**
 * @param {TypedLogger} logger
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
 * Every figure carries how many operators were accredited for it that month,
 * and how many it includes tonnage from, and the period carries the same for
 * each row's total across its months.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @param {ReportsRepository} params.reportsRepository
 * @param {TypedLogger} params.logger
 * @param {Year} params.year - the reporting year
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
    contributions: new Map(),
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
    accreditedMonths({ organisations, months }),
    [...into.contributions.values()],
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
        figures: periodFigures(into.cells, months),
        operatorCounts: periodOperatorCounts(operators)
      }
    }
  }
}
