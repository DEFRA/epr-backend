import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { addNationFigures } from './nation-figures-tab.js'
import {
  contentsFor,
  itMatchesThePublishedTab,
  JANUARY_TO_JUNE_2026,
  renderTab
} from './published-workbook-test-helpers.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

/**
 * @param {string} name
 * @param {YearMonth[]} months
 */
const render = async (name, months) => {
  const contents = await contentsFor(months)
  return renderTab((workbook) => addNationFigures(workbook, name, contents))
}

describe.each([WORKSHEET_NAME.UK, WORKSHEET_NAME.ENGLAND])(
  'the %j tab',
  (name) => {
    itMatchesThePublishedTab(name, () => render(name, JANUARY_TO_JUNE_2026))
  }
)

describe('a UK or England tab', () => {
  it('lays each month out after the last, however long the period', async () => {
    const worksheet = await render(WORKSHEET_NAME.UK, JANUARY_TO_MARCH_2026)

    expect(worksheet.getCell('A48').value).toBe('March 2026')
    expect(worksheet.getCell('A71').value).toBe('January 2026')
    expect(worksheet.getCell('A72').value).toBe('Reprocessor PRN Data ')
    expect(worksheet.getCell('A117').value).toBe('March 2026')
    expect(worksheet.rowCount).toBe(138)
  })
})
