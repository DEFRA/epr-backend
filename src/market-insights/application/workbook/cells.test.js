import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { frameOf } from './cells.js'
import {
  JANUARY_TO_JUNE_2026,
  PUBLISHED_EXTRACTION
} from './published-workbook-test-helpers.js'

describe('the frame every tab is laid out for', () => {
  it('names a period of several months from the first to the last', () => {
    expect(
      frameOf({ months: JANUARY_TO_JUNE_2026, now: PUBLISHED_EXTRACTION })
        .period
    ).toBe('January to June 2026')
  })

  it('names a period of one month by that month alone', () => {
    expect(
      frameOf({ months: [toYearMonth('2026-01')], now: PUBLISHED_EXTRACTION })
        .period
    ).toBe('January 2026')
  })

  it('dates the extraction in UK time', () => {
    expect(
      frameOf({
        months: JANUARY_TO_JUNE_2026,
        now: new Date('2026-08-09T23:30:00.000Z')
      }).asOf
    ).toBe('Data as of 10 August 2026  ')
  })
})
