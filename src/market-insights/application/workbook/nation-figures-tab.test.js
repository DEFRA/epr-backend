import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { frameOf } from './cells.js'
import { addNationFigures } from './nation-figures-tab.js'
import {
  itMatchesThePublishedTab,
  PUBLISHED_EXTRACTION,
  PUBLISHED_FRAME,
  renderTab
} from './published-workbook-test-helpers.js'

/** @import { Frame } from './cells.js' */

/**
 * @param {string} name
 * @param {Frame} frame
 */
const render = (name, frame) =>
  renderTab((workbook) => addNationFigures(workbook, name, frame))

describe.each([WORKSHEET_NAME.UK, WORKSHEET_NAME.ENGLAND])(
  'the %j tab',
  (name) => {
    itMatchesThePublishedTab(name, () => render(name, PUBLISHED_FRAME))
  }
)

describe('a UK or England tab', () => {
  it('lays each month out after the last, however long the period', async () => {
    const worksheet = await render(
      WORKSHEET_NAME.UK,
      frameOf({
        months: ['2026-01', '2026-02', '2026-03'].map(toYearMonth),
        now: PUBLISHED_EXTRACTION
      })
    )

    expect(worksheet.getCell('A48').value).toBe('March 2026')
    expect(worksheet.getCell('A71').value).toBe('January 2026')
    expect(worksheet.getCell('A72').value).toBe('Reprocessor PRN Data ')
    expect(worksheet.getCell('A117').value).toBe('March 2026')
    expect(worksheet.rowCount).toBe(138)
  })
})
