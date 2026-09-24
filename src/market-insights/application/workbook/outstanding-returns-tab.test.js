import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { frameOf } from './cells.js'
import { addOutstandingReturns } from './outstanding-returns-tab.js'
import {
  itMatchesThePublishedTab,
  PUBLISHED_EXTRACTION,
  PUBLISHED_FRAME,
  renderTab
} from './published-workbook-test-helpers.js'

/** @import { Frame } from './cells.js' */

/**
 * @param {Frame} frame
 */
const render = (frame) =>
  renderTab((workbook) => addOutstandingReturns(workbook, frame))

describe('the outstanding returns tab', () => {
  itMatchesThePublishedTab(WORKSHEET_NAME.OUTSTANDING_RETURNS, () =>
    render(PUBLISHED_FRAME)
  )

  it('lays each month out beside the last, however long the period', async () => {
    const worksheet = await render(
      frameOf({
        months: ['2026-01', '2026-02', '2026-03'].map(toYearMonth),
        now: PUBLISHED_EXTRACTION
      })
    )

    expect(worksheet.getCell('G7').value).toBe('March')
    expect(worksheet.getCell('J7').value).toBeNull()
  })
})
