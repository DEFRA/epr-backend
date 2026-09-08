import { describe, it, expect } from 'vitest'

import { isWithinDecemberWasteWindow } from './december-waste-window.js'

const DEFAULT_CONFIG = { windowStart: '12-01T00:00' }

describe('isWithinDecemberWasteWindow', () => {
  it.each([
    ['1 December 00:00 UK', '2026-12-01T00:00:00.000Z', true],
    ['15 December', '2026-12-15T12:00:00.000Z', true],
    ['1 January', '2027-01-01T00:00:00.000Z', true],
    ['31 January 23:59 UK', '2027-01-31T23:59:00.000Z', true],
    [
      '30 November 23:59 UK, one minute before the window opens',
      '2026-11-30T23:59:00.000Z',
      false
    ],
    [
      '1 February 00:00 UK, one minute after the deadline',
      '2027-02-01T00:00:00.000Z',
      false
    ],
    ['mid-year', '2026-06-15T12:00:00.000Z', false]
  ])('%s -> %s', (_label, isoNow, expected) => {
    expect(
      isWithinDecemberWasteWindow(2026, new Date(isoNow), DEFAULT_CONFIG)
    ).toBe(expected)
  })

  it('resolves a widened windowStart correctly across the BST transition', () => {
    const widened = { windowStart: '06-01T00:00' }

    // 2026-05-31T23:00:00Z is 2026-06-01T00:00 UK (BST, UTC+1) - inside.
    expect(
      isWithinDecemberWasteWindow(
        2026,
        new Date('2026-05-31T23:00:00.000Z'),
        widened
      )
    ).toBe(true)

    // 2026-05-31T22:59:00Z is 2026-05-31T23:59 UK - outside, one minute short.
    expect(
      isWithinDecemberWasteWindow(
        2026,
        new Date('2026-05-31T22:59:00.000Z'),
        widened
      )
    ).toBe(false)
  })

  it('still closes at 31 January the year after, even when windowStart is widened', () => {
    const widened = { windowStart: '06-01T00:00' }

    expect(
      isWithinDecemberWasteWindow(
        2026,
        new Date('2027-01-31T23:59:00.000Z'),
        widened
      )
    ).toBe(true)
    expect(
      isWithinDecemberWasteWindow(
        2026,
        new Date('2027-02-01T00:00:00.000Z'),
        widened
      )
    ).toBe(false)
  })
})
