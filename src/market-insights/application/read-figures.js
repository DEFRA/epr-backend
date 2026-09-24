import { buildOutstandingReturnsTable } from '#market-insights/application/outstanding-returns.js'
import { buildReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js'
import { buildWasteBalanceTable } from '#market-insights/application/waste-balance-table.js'
import { REGULATOR_FOR_NATION_SEGMENT } from '#market-insights/domain/nation-segment.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */

/**
 * The five scopes the pages cover: the UK, drawn from every regulator, and one
 * per nation.
 *
 * @type {readonly { name: string, regulator?: import('#domain/organisations/model.js').RegulatorValue }[]}
 */
const SCOPES = Object.freeze([
  { name: 'uk' },
  ...Object.entries(REGULATOR_FOR_NATION_SEGMENT).map(([name, regulator]) => ({
    name,
    regulator
  }))
])

/**
 * @typedef {Object} ReadMarketInsightsFiguresParams
 * @property {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @property {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @property {import('#overseas-sites/repository/port.js').OverseasSitesRepository} overseasSitesRepository
 * @property {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @property {import('#common/hapi-types.js').TypedLogger} logger
 * @property {number} year
 * @property {YearMonth[]} months - the reporting months to publish, in order
 * @property {Date} now - the one clock reading every figure is taken at
 */

/**
 * @typedef {Object} ScopeFigures
 * @property {string} name
 * @property {Awaited<ReturnType<typeof buildReprocessorExporterTable>>} table
 */

/**
 * @typedef {Object} MarketInsightsFigures
 * @property {Awaited<ReturnType<typeof buildWasteBalanceTable>>} wasteBalance
 * @property {ScopeFigures[]} scopes - the UK first, then one per nation
 * @property {Awaited<ReturnType<typeof buildOutstandingReturnsTable>>} outstandingReturns
 */

/**
 * Runs the read once and hands the same promise to everyone who asks.
 *
 * @template T
 * @param {() => Promise<T>} read
 * @returns {() => Promise<T>}
 */
const readOnce = (read) => {
  /** @type {Promise<T> | undefined} */
  let reading
  return () => (reading ??= read())
}

/**
 * The repositories as this read sees them: every builder sees the same
 * organisations and the same periodic reports, read once.
 *
 * That is what makes the figures agree with each other. Sharing a clock reading
 * never did: seven builders reading in turn would each see the register as it
 * stood when they got to it, so a report submitted mid-build would land in some
 * nation's figures and not another's.
 *
 * The memo is scoped to one call, and every builder here is given the same
 * `year`, so the ignored argument cannot hide a different question.
 *
 * @param {Pick<ReadMarketInsightsFiguresParams, 'organisationsRepository' | 'reportsRepository'>} repositories
 * @param {number} year
 */
const asReadOnce = ({ organisationsRepository, reportsRepository }, year) => ({
  organisationsRepository: {
    ...organisationsRepository,
    findAll: readOnce(() => organisationsRepository.findAll())
  },
  reportsRepository: {
    ...reportsRepository,
    findPeriodicReportsForYear: readOnce(() =>
      reportsRepository.findPeriodicReportsForYear({ year })
    )
  }
})

/**
 * Every figure behind the market insights publication, taken from one reading
 * of the register.
 *
 * The builders are called directly rather than over HTTP so that they can be
 * given that one reading between them. They run concurrently, so the wall time
 * is the longest build rather than the sum of seven.
 *
 * @param {ReadMarketInsightsFiguresParams} params
 * @returns {Promise<MarketInsightsFigures>}
 */
export const readMarketInsightsFigures = async ({
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
  const shared = asReadOnce(
    { organisationsRepository, reportsRepository },
    year
  )
  const common = { ...shared, logger, year, months, now }

  const [wasteBalance, scopeTables, outstandingReturns] = await Promise.all([
    buildWasteBalanceTable({
      ...common,
      ledgerRepository,
      summaryLogRowStatesRepository,
      overseasSitesRepository
    }),
    Promise.all(
      SCOPES.map((scope) =>
        buildReprocessorExporterTable({ ...common, regulator: scope.regulator })
      )
    ),
    buildOutstandingReturnsTable(common)
  ])

  return {
    wasteBalance,
    scopes: scopeTables.map((table, index) => ({
      name: SCOPES[index].name,
      table
    })),
    outstandingReturns
  }
}
