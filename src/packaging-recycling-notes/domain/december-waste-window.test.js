import { toYear } from '#common/helpers/dates/year.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { afterEach, describe, it, expect } from 'vitest'
import { config } from '#root/config.js'

import {
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  assertDecemberWasteDeclarable,
  DECEMBER_WASTE_NOT_DECLARABLE_CODE,
  isWithinDecemberWasteWindow
} from './december-waste-window.js'

const outputReprocessor = {
  accreditationNumber: toAccreditationNumber('A26ER0000000001PA'),
  accreditationYear: toYear(2026),
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.OUTPUT
}

const inputReprocessor = {
  accreditationNumber: toAccreditationNumber('A26ER0000000002PA'),
  accreditationYear: toYear(2026),
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.INPUT
}

const exporter = {
  accreditationNumber: toAccreditationNumber('A26EX0000000003PA'),
  accreditationYear: toYear(2026),
  wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER
}

describe('isWithinDecemberWasteWindow', () => {
  afterEach(() => {
    config.reset('decemberWaste.windowStart')
  })

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
    expect(isWithinDecemberWasteWindow(toYear(2026), new Date(isoNow))).toBe(
      expected
    )
  })

  it('resolves a widened windowStart on the UK day across the BST transition', () => {
    config.set('decemberWaste.windowStart', '06-01T00:00')

    expect(
      isWithinDecemberWasteWindow(
        toYear(2026),
        new Date('2026-05-31T23:00:00.000Z')
      )
    ).toBe(true)
    expect(
      isWithinDecemberWasteWindow(
        toYear(2026),
        new Date('2026-05-31T22:59:00.000Z')
      )
    ).toBe(false)
  })

  it('opens at the start of the windowStart day, whatever its time', () => {
    config.set('decemberWaste.windowStart', '12-01T09:00')

    expect(
      isWithinDecemberWasteWindow(
        toYear(2026),
        new Date('2026-12-01T00:00:00.000Z')
      )
    ).toBe(true)
  })

  it('still closes at 31 January the year after, even when windowStart is widened', () => {
    config.set('decemberWaste.windowStart', '06-01T00:00')

    expect(
      isWithinDecemberWasteWindow(
        toYear(2026),
        new Date('2027-01-31T23:59:00.000Z')
      )
    ).toBe(true)
    expect(
      isWithinDecemberWasteWindow(
        toYear(2026),
        new Date('2027-02-01T00:00:00.000Z')
      )
    ).toBe(false)
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
        now: outsideWindow
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
        now: inWindow
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
        now: outsideWindow
      })
    ).toThrow(throwsNotDeclarable)
  })
})
