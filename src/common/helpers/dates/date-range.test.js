import { calendarDate } from '#common/helpers/date-formatter.js'
import {
  joinDateRanges,
  restrictDateRanges,
  subtractDateRanges
} from './date-range.js'

const range = (/** @type {string} */ from, /** @type {string} */ to) => ({
  from: calendarDate(from),
  to: calendarDate(to)
})

describe('restrictDateRanges', () => {
  const bounds = range('2026-01-01', '2026-12-31')

  it.each([
    [
      'inside',
      range('2026-03-01', '2026-04-30'),
      range('2026-03-01', '2026-04-30')
    ],
    [
      'overlapping the start',
      range('2025-06-01', '2026-02-14'),
      range('2026-01-01', '2026-02-14')
    ],
    [
      'overlapping the end',
      range('2026-09-10', '2027-03-01'),
      range('2026-09-10', '2026-12-31')
    ],
    ['spanning', range('2025-01-01', '2027-12-31'), bounds]
  ])('keeps a range %s', (_, input, expected) => {
    expect(restrictDateRanges([input], bounds)).toEqual([expected])
  })

  it('drops a range outside the bounds', () => {
    expect(
      restrictDateRanges([range('2025-01-01', '2025-12-31')], bounds)
    ).toEqual([])
  })
})

describe('joinDateRanges', () => {
  it('joins overlapping ranges', () => {
    expect(
      joinDateRanges([
        range('2026-01-01', '2026-03-10'),
        range('2026-03-01', '2026-05-31')
      ])
    ).toEqual([range('2026-01-01', '2026-05-31')])
  })

  it('joins ranges that follow on from each other', () => {
    expect(
      joinDateRanges([
        range('2026-01-01', '2026-05-31'),
        range('2026-06-01', '2026-09-09')
      ])
    ).toEqual([range('2026-01-01', '2026-09-09')])
  })

  it('keeps separate ranges, oldest first', () => {
    expect(
      joinDateRanges([
        range('2026-09-01', '2026-12-31'),
        range('2026-01-01', '2026-03-31')
      ])
    ).toEqual([
      range('2026-01-01', '2026-03-31'),
      range('2026-09-01', '2026-12-31')
    ])
  })
})

describe('subtractDateRanges', () => {
  it('leaves the parts before and after a removal', () => {
    expect(
      subtractDateRanges(
        [range('2026-01-01', '2026-12-31')],
        [range('2026-02-15', '2026-09-09')]
      )
    ).toEqual([
      range('2026-01-01', '2026-02-14'),
      range('2026-09-10', '2026-12-31')
    ])
  })

  it('handles several removals', () => {
    expect(
      subtractDateRanges(
        [range('2026-01-01', '2026-12-31')],
        [range('2026-02-01', '2026-02-28'), range('2026-06-01', '2026-06-30')]
      )
    ).toEqual([
      range('2026-01-01', '2026-01-31'),
      range('2026-03-01', '2026-05-31'),
      range('2026-07-01', '2026-12-31')
    ])
  })

  it('removes a range wholly covered', () => {
    expect(
      subtractDateRanges(
        [range('2026-03-01', '2026-03-31')],
        [range('2026-01-01', '2026-12-31')]
      )
    ).toEqual([])
  })
})
