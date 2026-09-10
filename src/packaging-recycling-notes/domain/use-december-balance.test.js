import { describe, it, expect } from 'vitest'

import {
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  accruesDecember,
  resolveUseDecemberBalance
} from './use-december-balance.js'

const outputReprocessor = {
  id: 'acc-output',
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.OUTPUT
}

const inputReprocessor = {
  id: 'acc-input',
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.INPUT
}

const exporter = {
  id: 'acc-exporter',
  wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER
}

describe('accruesDecember', () => {
  it.each([
    ['an exporter accrues December capacity', exporter, true],
    [
      'a reprocessor on input accrues December capacity',
      inputReprocessor,
      true
    ],
    [
      'a reprocessor on output accrues no December capacity',
      outputReprocessor,
      false
    ]
  ])('%s', (_label, accreditation, expected) => {
    expect(accruesDecember(accreditation)).toBe(expected)
  })
})

describe('resolveUseDecemberBalance', () => {
  // The full ADR-0049 resolution table: useDecemberBalance is the pool-routing
  // flag on the balance event, distinct from the PRN's isDecemberWaste
  // disclosure. Output reprocessors may self-declare December for disclosure
  // yet always draw the single general balance (useDecemberBalance false).
  it.each([
    [
      'exporter declaring December draws the December pool',
      exporter,
      true,
      true
    ],
    ['exporter not declaring draws general', exporter, false, false],
    [
      'input reprocessor declaring December draws the December pool',
      inputReprocessor,
      true,
      true
    ],
    [
      'input reprocessor not declaring draws general',
      inputReprocessor,
      false,
      false
    ],
    [
      'output reprocessor declaring December still draws general (disclosure-only)',
      outputReprocessor,
      true,
      false
    ],
    [
      'output reprocessor not declaring draws general',
      outputReprocessor,
      false,
      false
    ]
  ])('%s', (_label, accreditation, isDecemberWaste, expected) => {
    expect(resolveUseDecemberBalance({ isDecemberWaste, accreditation })).toBe(
      expected
    )
  })
})
