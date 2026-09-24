import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { frameOf } from './cells.js'
import {
  itMatchesThePublishedTab,
  PUBLISHED_EXTRACTION,
  PUBLISHED_FRAME,
  renderTab
} from './published-workbook-test-helpers.js'
import { addWasteBalance } from './waste-balance-tab.js'

/** @import { Frame } from './cells.js' */

/**
 * @param {Frame} frame
 */
const render = (frame) =>
  renderTab((workbook) => addWasteBalance(workbook, frame))

describe('the waste balance tab', () => {
  itMatchesThePublishedTab(WORKSHEET_NAME.WASTE_BALANCE, () =>
    render(PUBLISHED_FRAME)
  )

  it('links the note to its GOV.UK page', async () => {
    const worksheet = await render(PUBLISHED_FRAME)

    expect(worksheet.getCell('A1').hyperlink).toBe(
      'https://www.gov.uk/government/publications/packaging-waste-data-reported-by-reprocessors-and-exporters'
    )
  })

  it('puts the total after the last month, however long the period', async () => {
    const worksheet = await render(
      frameOf({
        months: ['2026-01', '2026-02', '2026-03'].map(toYearMonth),
        now: PUBLISHED_EXTRACTION
      })
    )

    expect(worksheet.getCell('F9').value).toBe('Total')
  })
})
