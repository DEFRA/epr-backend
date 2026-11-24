import { addRounded, toNumber } from '#common/helpers/decimal-utils.js'
import { LOGGING_EVENT_CATEGORIES } from '#common/enums/index.js'
import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { ledgerKey } from '#waste-balances/repository/ledger-schema.js'
import {
  indexByLedger,
  overseasSitesOf,
  validityOf
} from '#waste-balances/application/read-model-accreditations.js'
import { classifyRecordForWasteBalance } from '#waste-balances/domain/waste-balance-classification.js'
import { tableSchemasOf } from '#domain/summary-logs/table-schemas/index.js'
import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  addFigures,
  EXPORTER_AND_REPROCESSOR,
  MERGED_ROWS,
  monthlyContribution,
  NO_FIGURES,
  SEPARATE_ROWS,
  withNetCredit
} from '#market-insights/domain/waste-balance-figures.js'
import { fromFewOperators } from '#market-insights/domain/confidential-figures.js'
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

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Registration as ReadModelRegistration } from '#organisation-read-model/vocabulary.js' */
/** @import { LedgerAccreditation } from '#waste-balances/application/read-model-accreditations.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/index.js' */
/** @import { AccreditationValidity } from '#domain/organisations/accreditation.js' */
/** @import { AccreditationNumber, OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { OverseasSitesContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} SummaryLogRowStatesRepository
 * @typedef {import('#reports/repository/port.js').ReportsRepository} ReportsRepository
 * @typedef {import('#market-insights/application/monthly-reports.js').ReportCount} ReportCount
 * @typedef {import('#common/helpers/dates/year-month.js').YearMonth} YearMonth
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').WasteBalanceFigures} WasteBalanceFigures
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').PublishedWasteBalanceFigures} PublishedWasteBalanceFigures
 * @typedef {import('#waste-balances/repository/ledger-port.js').LatestSubmittedSummaryLogPerLedger} LatestSubmittedSummaryLogPerLedger
 * @typedef {import('#waste-records/repository/port.js').SubmittedRowState} SubmittedRowState
 * @typedef {import('#domain/organisations/model.js').Material} Material
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').MonthlyContribution} MonthlyContribution
 * @typedef {import('#market-insights/domain/waste-balance-figures.js').WasteBalanceRowType} WasteBalanceRowType
 * @typedef {import('#market-insights/application/operator-counts.js').Contribution} Contribution
 * @typedef {import('#market-insights/application/operator-counts.js').OperatorCounts} OperatorCounts
 * @typedef {import('#market-insights/application/operator-counts.js').OperatorsByFigure} OperatorsByFigure
 */

/**
 * @typedef {Object} PublishedPartition
 * @property {string} summaryLogId - the partition's latest submission
 * @property {OrganisationNumber} organisationNumber
 * @property {RegistrationNumber} registrationNumber
 * @property {ReadModelRegistration} registration
 * @property {AccreditationValidity} accreditation
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
 * A value for each of a material's exporter, reprocessor and merged rows.
 *
 * @template T
 * @typedef {Record<WasteBalanceRowType, T>} EveryRow
 */

/**
 * A value for each row a material is served as: either its exporter and
 * reprocessor rows or, where those would identify an operator, the one row
 * merging them.
 *
 * @template T
 * @typedef {Partial<Record<WasteBalanceRowType, T>>} ServedRows
 */

/**
 * @typedef {Record<Material, ServedRows<PublishedWasteBalanceFigures & OperatorCounts>>} FiguresByMaterial
 * @typedef {Record<Material, ServedRows<OperatorCounts>>} OperatorCountsByMaterial
 * @typedef {Record<Material, ServedRows<PublishedWasteBalanceFigures>>} PeriodFiguresByMaterial
 * @typedef {Record<Material, readonly WasteBalanceRowType[]>} RowsByMaterial
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
 * @typedef {Object} AggregateMonth
 * @property {ReportCount} reports
 * @property {Record<Material, EveryRow<PublishedWasteBalanceFigures & OperatorCounts>>} figures
 */

/**
 * @typedef {Object} AggregatePeriod
 * @property {ReportCount} reports
 * @property {Record<Material, EveryRow<PublishedWasteBalanceFigures>>} figures
 * @property {Record<Material, EveryRow<OperatorCounts>>} operatorCounts
 */

/**
 * The waste balance table before the rows that would identify an operator
 * are merged: every material carries all three of its rows.
 *
 * @typedef {Object} AggregateWasteBalanceTable
 * @property {{ generatedAt: string }} meta
 * @property {{ months: Record<YearMonth, AggregateMonth>, period: AggregatePeriod }} data
 */

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
 * The rows a registration's tonnage counts towards: its own accreditation
 * type's, and the merged row that stands in for both types where they would
 * identify an operator.
 *
 * @param {ReadModelRegistration} registration
 */
const rowsOfRegistration = ({ material, wasteProcessingType }) => [
  { material, accreditationType: wasteProcessingType },
  { material, accreditationType: EXPORTER_AND_REPROCESSOR }
]

/**
 * The cells a contribution counts towards, and their rows' whole-period
 * totals. An operator counts once in each, however many sites it reports from
 * and however many months it contributes to, so one accredited as both
 * exporter and reprocessor counts once in the merged row.
 *
 * @param {Contribution} contribution
 */
const figuresOf = ({ month, registration }) =>
  rowsOfRegistration(registration).flatMap((row) => [
    cellKey({ ...row, month }),
    periodKey(row)
  ])

/** @type {readonly WasteBalanceRowType[]} */
const EVERY_ROW = [...SEPARATE_ROWS, ...MERGED_ROWS]

/**
 * @param {Map<string, WasteBalanceCell>} cells
 * @param {OperatorsByFigure} operators
 * @param {Pick<WasteBalanceCell, 'material' | 'accreditationType' | 'month'>} cell
 * @returns {PublishedWasteBalanceFigures & OperatorCounts}
 */
const publishedFigure = (cells, operators, cell) => {
  const key = cellKey(cell)
  return {
    ...withNetCredit(cells.get(key)?.figures ?? NO_FIGURES),
    ...operatorCountsOf(operators, key)
  }
}

/**
 * A row's figures summed across the months served, so a reader of the period
 * never adds them up itself.
 *
 * @param {Map<string, WasteBalanceCell>} cells
 * @param {YearMonth[]} months
 * @param {Pick<WasteBalanceCell, 'material' | 'accreditationType'>} row
 * @returns {PublishedWasteBalanceFigures}
 */
const periodFigure = (cells, months, row) =>
  withNetCredit(
    months
      .map(
        (month) => cells.get(cellKey({ ...row, month }))?.figures ?? NO_FIGURES
      )
      .reduce((sum, figures) => addFigures(sum, figures), NO_FIGURES)
  )

/**
 * The operators behind each row's whole-period total, for every material and
 * row the aggregate carries.
 *
 * @param {OperatorsByFigure} operators
 * @returns {AggregatePeriod['operatorCounts']}
 */
const periodOperatorCounts = (operators) =>
  recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
    recordOf(EVERY_ROW, (accreditationType) =>
      operatorCountsOf(operators, periodKey({ material, accreditationType }))
    )
  )

/**
 * The publication prints every material, so one nothing reported into is
 * still served, at zero.
 *
 * @param {Map<string, WasteBalanceCell>} cells
 * @param {OperatorsByFigure} operators
 * @param {YearMonth} month
 * @returns {AggregateMonth['figures']}
 */
const publishedFigures = (cells, operators, month) =>
  recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
    recordOf(EVERY_ROW, (accreditationType) =>
      publishedFigure(cells, operators, { material, accreditationType, month })
    )
  )

/**
 * @param {Map<string, WasteBalanceCell>} cells
 * @param {YearMonth[]} months
 * @returns {AggregatePeriod['figures']}
 */
const periodFigures = (cells, months) =>
  recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
    recordOf(EVERY_ROW, (accreditationType) =>
      periodFigure(cells, months, { material, accreditationType })
    )
  )

/**
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {AccreditationNumber} accreditationNumber
 * @param {Year} year
 */
const warnAboutUnmatchedPartition = (logger, accreditationNumber, year) => {
  logger.warn({
    message: `Market insights waste balance left out a ledger partition whose accreditation no longer resolves: ${accreditationNumber} for ${year}. Everything that partition reported is absent from the publication.`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: 'market_insights_partition_unmatched',
      reference: accreditationNumber
    }
  })
}

/**
 * @param {LatestSubmittedSummaryLogPerLedger[]} entries
 * @param {Map<string, LedgerAccreditation>} index - by `ledgerKey`
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @returns {Map<string, PublishedPartition>}
 */
const resolvePublishedPartitions = (entries, index, logger) => {
  /** @type {Map<string, PublishedPartition>} */
  const partitions = new Map()
  for (const { ledgerId, summaryLogId } of entries) {
    const { accreditationNumber } = ledgerId
    if (accreditationNumber === null) {
      continue
    }
    const ledgerAccreditation = index.get(ledgerKey(ledgerId))
    if (ledgerAccreditation === undefined) {
      if (!TEST_ORGANISATION_NUMBERS.has(ledgerId.organisationNumber)) {
        warnAboutUnmatchedPartition(logger, accreditationNumber, ledgerId.year)
      }
      continue
    }
    partitions.set(ledgerKey(ledgerId), {
      summaryLogId,
      organisationNumber: ledgerAccreditation.organisation.organisationNumber,
      registrationNumber: ledgerAccreditation.registrationNumber,
      registration: ledgerAccreditation.registration,
      accreditation: validityOf(ledgerAccreditation.accreditation),
      overseasSites: overseasSitesOf(ledgerAccreditation.accreditation)
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
  const partition = partitions.get(ledgerKey(rowState))
  if (partition === undefined) {
    return null
  }
  const { registration, accreditation, overseasSites } = partition
  const classification = classifyRecordForWasteBalance(
    { type: rowState.wasteRecordType, data: rowState.data },
    {
      tableSchemas: tableSchemasOf(rowState.year, rowState.processingType),
      accreditation,
      overseasSites
    }
  )

  const contribution = monthlyContribution(
    { ...rowState, classification },
    registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
      ? {
          wasteProcessingType: registration.wasteProcessingType,
          reprocessingType: registration.reprocessingType
        }
      : { wasteProcessingType: registration.wasteProcessingType }
  )

  return contribution === null
    ? null
    : {
        organisationNumber: partition.organisationNumber,
        registrationNumber: partition.registrationNumber,
        registration,
        contribution
      }
}

/**
 * @typedef {Object} PublishedRow
 * @property {OrganisationNumber} organisationNumber
 * @property {RegistrationNumber} registrationNumber
 * @property {ReadModelRegistration} registration
 * @property {MonthlyContribution} contribution
 */

/**
 * @param {Map<string, WasteBalanceCell>} cells
 * @param {ReadModelRegistration} registration
 * @param {string} month
 * @param {WasteBalanceFigures} figures
 */
const foldIntoCell = (cells, registration, month, figures) => {
  for (const row of rowsOfRegistration(registration)) {
    const cell = { ...row, month }
    const key = cellKey(cell)
    cells.set(key, {
      ...cell,
      figures: addFigures(cells.get(key)?.figures ?? NO_FIGURES, figures)
    })
  }
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
  { organisationNumber, registrationNumber, registration, contribution }
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
    contributions.set(`${registrationNumber}::${month}`, {
      month,
      organisationNumber,
      registrationNumber,
      registration
    })
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
 * Every figure carries how many operators were accredited for it that month,
 * and how many it includes tonnage from, and the period carries the same for
 * each row's total across its months. Every material carries its exporter and
 * reprocessor rows and the row merging them.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {OrganisationReadRepository} params.organisationReadRepository
 * @param {ReportsRepository} params.reportsRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {Year} params.year - the reporting year
 * @param {YearMonth[]} params.months - the reporting months of that year to publish
 * @param {Date} params.now - clock reading supplied by the caller
 * @returns {Promise<AggregateWasteBalanceTable>}
 */
export const aggregateWasteBalanceTable = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationReadRepository,
  reportsRepository,
  logger,
  year,
  months,
  now
}) => {
  const [entries, organisations, periodicReports] = await Promise.all([
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
    organisationReadRepository.findAll(),
    reportsRepository.findPeriodicReportsForYear({ year })
  ])

  const partitions = resolvePublishedPartitions(
    entries,
    indexByLedger(organisations),
    logger
  )

  const summaryLogIds = entries
    .filter((entry) => partitions.has(ledgerKey(entry.ledgerId)))
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

/**
 * Whether any figure in a material's exporter or reprocessor row, in any month
 * or across the period, comes from fewer than three operators.
 *
 * @param {AggregateWasteBalanceTable} table
 * @param {Material} material
 */
const identifiesAnOperator = ({ data: { months, period } }, material) =>
  SEPARATE_ROWS.some((accreditationType) =>
    [
      ...Object.values(months).map(
        ({ figures }) => figures[material][accreditationType]
      ),
      {
        ...period.figures[material][accreditationType],
        ...period.operatorCounts[material][accreditationType]
      }
    ].some((figure) => fromFewOperators(figure, figure.netCredit !== 0))
  )

/**
 * @template T
 * @param {Record<Material, EveryRow<T>>} byMaterial
 * @param {RowsByMaterial} rows
 * @returns {Record<Material, ServedRows<T>>}
 */
const onlyRows = (byMaterial, rows) =>
  recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
    recordOf(rows[material], (row) => byMaterial[material][row])
  )

/**
 * The table as published: a material whose exporter or reprocessor figures
 * would identify an operator is served as the one row merging the two, for
 * the whole period, and every other material as its two separate rows. No
 * material is a special case.
 *
 * @param {AggregateWasteBalanceTable} table
 * @returns {WasteBalanceTable}
 */
export const mergeRowsFromFewOperators = (table) => {
  /** @type {RowsByMaterial} */
  const rows = recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
    identifiesAnOperator(table, material) ? MERGED_ROWS : SEPARATE_ROWS
  )
  const { months, period } = table.data
  return {
    ...table,
    data: {
      months: /** @type {Record<YearMonth, PublishedMonth>} */ (
        Object.fromEntries(
          Object.entries(months).map(([month, published]) => [
            month,
            { ...published, figures: onlyRows(published.figures, rows) }
          ])
        )
      ),
      period: {
        ...period,
        figures: onlyRows(period.figures, rows),
        operatorCounts: onlyRows(period.operatorCounts, rows)
      }
    }
  }
}

/**
 * The published UK Waste Balance figures for the given reporting months, as
 * every page and workbook shows them.
 *
 * @param {Parameters<typeof aggregateWasteBalanceTable>[0]} params
 * @returns {Promise<WasteBalanceTable>}
 */
export const buildWasteBalanceTable = async (params) =>
  mergeRowsFromFewOperators(await aggregateWasteBalanceTable(params))
