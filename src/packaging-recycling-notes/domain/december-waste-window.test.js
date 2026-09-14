import { describe, it, expect } from 'vitest'

import {
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  assertDecemberWasteDeclarable,
  declaresDecemberWasteManually,
  DECEMBER_WASTE_NOT_DECLARABLE_CODE,
  isWithinDecemberWasteWindow
} from './december-waste-window.js'

const DEFAULT_CONFIG = { windowStart: '12-01T00:00' }

const outputReprocessor = {
  id: 'acc-output',
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.OUTPUT,
  validFrom: '2026-01-01'
}

const inputReprocessor = {
  id: 'acc-input',
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.INPUT,
  validFrom: '2026-01-01'
}

const exporter = {
  id: 'acc-exporter',
  wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
  validFrom: '2026-01-01'
}

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

describe('declaresDecemberWasteManually', () => {
  it('is true for a reprocessor on output', () => {
    expect(declaresDecemberWasteManually(outputReprocessor)).toBe(true)
  })

  it('is false for a reprocessor on input', () => {
    expect(declaresDecemberWasteManually(inputReprocessor)).toBe(false)
  })

  it('is false for an exporter', () => {
    expect(declaresDecemberWasteManually(exporter)).toBe(false)
  })
})

describe('assertDecemberWasteDeclarable', () => {
  const inWindow = new Date('2026-12-15T12:00:00.000Z')
  const outsideWindow = new Date('2026-06-15T12:00:00.000Z')

  const throwsNotDeclarable = expect.objectContaining({
    output: expect.objectContaining({
      payload: expect.objectContaining({
        code: DECEMBER_WASTE_NOT_DECLARABLE_CODE
      })
    })
  })

  it('does not throw when isDecemberWaste is false, regardless of type or window', () => {
    expect(() =>
      assertDecemberWasteDeclarable({
        accreditation: exporter,
        isDecemberWaste: false,
        now: outsideWindow,
        config: DEFAULT_CONFIG
      })
    ).not.toThrow()
  })

  // The window gates every declarer alike (PAE-1922): the December disclosure
  // duty is uniform across accreditation types, so who accrues a December
  // balance governs pool routing, not whether the declaration is permitted.
  it.each([
    ['an output reprocessor', outputReprocessor],
    ['an input reprocessor', inputReprocessor],
    ['an exporter', exporter]
  ])('does not throw for %s inside the window', (_label, accreditation) => {
    expect(() =>
      assertDecemberWasteDeclarable({
        accreditation,
        isDecemberWaste: true,
        now: inWindow,
        config: DEFAULT_CONFIG
      })
    ).not.toThrow()
  })

  it.each([
    ['an output reprocessor', outputReprocessor],
    ['an input reprocessor', inputReprocessor],
    ['an exporter', exporter]
  ])('throws for %s outside the window', (_label, accreditation) => {
    expect(() =>
      assertDecemberWasteDeclarable({
        accreditation,
        isDecemberWaste: true,
        now: outsideWindow,
        config: DEFAULT_CONFIG
      })
    ).toThrow(throwsNotDeclarable)
  })
})
