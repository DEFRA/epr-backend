import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { addOutstandingReturns } from './outstanding-returns-tab.js'
import {
  contentsFor,
  itMatchesThePublishedTab,
  JANUARY_TO_JUNE_2026,
  renderTab
} from './published-workbook-test-helpers.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

/**
 * @param {YearMonth[]} months
 */
const render = async (months) => {
  const contents = await contentsFor(months)
  return renderTab((workbook) => addOutstandingReturns(workbook, contents))
}

describe('the outstanding returns tab', () => {
  itMatchesThePublishedTab(WORKSHEET_NAME.OUTSTANDING_RETURNS, () =>
    render(JANUARY_TO_JUNE_2026)
  )

  it('lays each month out beside the last, however long the period', async () => {
    const worksheet = await render(JANUARY_TO_MARCH_2026)

    expect(worksheet.getCell('G7').value).toBe('March')
    expect(worksheet.getCell('J7').value).toBeNull()
  })
})
