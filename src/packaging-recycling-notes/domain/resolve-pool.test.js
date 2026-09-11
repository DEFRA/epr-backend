import { describe, it, expect } from 'vitest'

import {
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { POOL } from '#waste-balances/repository/ledger-schema.js'
import { accruesDecember, resolvePool } from './resolve-pool.js'

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

describe('resolvePool', () => {
  // The full ADR-0049 resolution table: the pool is the balance the PRN draws
  // on, distinct from the PRN's isDecemberWaste disclosure. Output reprocessors
  // may self-declare December for disclosure yet always draw the single general
  // balance.
  it.each([
    [
      'exporter declaring December draws the December pool',
      exporter,
      true,
      POOL.DECEMBER
    ],
    ['exporter not declaring draws general', exporter, false, POOL.GENERAL],
    [
      'input reprocessor declaring December draws the December pool',
      inputReprocessor,
      true,
      POOL.DECEMBER
    ],
    [
      'input reprocessor not declaring draws general',
      inputReprocessor,
      false,
      POOL.GENERAL
    ],
    [
      'output reprocessor declaring December still draws general (disclosure-only)',
      outputReprocessor,
      true,
      POOL.GENERAL
    ],
    [
      'output reprocessor not declaring draws general',
      outputReprocessor,
      false,
      POOL.GENERAL
    ]
  ])('%s', (_label, accreditation, isDecemberWaste, expected) => {
    expect(resolvePool({ isDecemberWaste, accreditation })).toBe(expected)
  })
})
