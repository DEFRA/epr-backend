import { describe, it, expect } from 'vitest'

import {
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { decemberWasteControlModeFor } from './december-waste-control-mode.js'

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

describe('decemberWasteControlModeFor', () => {
  it.each([
    ['an exporter', exporter, 'pool'],
    ['an input reprocessor', inputReprocessor, 'pool'],
    ['an output reprocessor', outputReprocessor, 'manual']
  ])('resolves %s to %s', (_, accreditation, expected) => {
    expect(decemberWasteControlModeFor(accreditation)).toBe(expected)
  })
})
