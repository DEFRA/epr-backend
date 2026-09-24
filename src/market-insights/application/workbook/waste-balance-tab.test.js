import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { addWasteBalance } from './waste-balance-tab.js'
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
  return renderTab((workbook) => addWasteBalance(workbook, contents))
}

describe('the waste balance tab', () => {
  itMatchesThePublishedTab(WORKSHEET_NAME.WASTE_BALANCE, () =>
    render(JANUARY_TO_JUNE_2026)
  )

  it('links the note to its GOV.UK page', async () => {
    const worksheet = await render(JANUARY_TO_JUNE_2026)

    expect(worksheet.getCell('A1').hyperlink).toBe(
      'https://www.gov.uk/government/publications/packaging-waste-data-reported-by-reprocessors-and-exporters'
    )
  })

  it('puts the total after the last month, however long the period', async () => {
    const worksheet = await render(JANUARY_TO_MARCH_2026)

    expect(worksheet.getCell('F9').value).toBe('Total')
  })
})
