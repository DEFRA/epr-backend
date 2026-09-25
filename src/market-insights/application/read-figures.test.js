import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { REGULATOR_FOR_NATION_SEGMENT } from '#market-insights/domain/nation-segment.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { readMarketInsightsFigures } from './read-figures.js'

/** @import { ReadMarketInsightsFiguresParams } from './read-figures.js' */

/**
 * @param {Partial<ReadMarketInsightsFiguresParams>} [overrides]
 */
const read = (overrides = {}) =>
  readMarketInsightsFigures({
    ledgerRepository: createInMemoryLedgerRepository()(),
    summaryLogRowStatesRepository:
      createInMemorySummaryLogRowStatesRepository()(),
    organisationsRepository: createInMemoryOrganisationsRepository([])(),
    overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
    reportsRepository: createInMemoryReportsRepository()(),
    logger: createMockLogger(),
    year: 2026,
    months: ['2026-01', '2026-02'].map(toYearMonth),
    now: new Date('2026-09-18T14:15:30.000Z'),
    ...overrides
  })

describe('reading the market insights figures', () => {
  it('reads the register once and gives every builder the same reading', async () => {
    const organisationsRepository = createInMemoryOrganisationsRepository([])()
    const reportsRepository = createInMemoryReportsRepository()()
    const findAll = vi.spyOn(organisationsRepository, 'findAll')
    const findReports = vi.spyOn(
      reportsRepository,
      'findPeriodicReportsForYear'
    )

    await read({ organisationsRepository, reportsRepository })

    expect(findAll).toHaveBeenCalledOnce()
    expect(findReports).toHaveBeenCalledOnce()
  })

  it('gives the UK figures first, then each nation', async () => {
    const { scopes } = await read()

    expect(scopes.map(({ name }) => name)).toEqual([
      'uk',
      ...Object.keys(REGULATOR_FOR_NATION_SEGMENT)
    ])
  })
})
