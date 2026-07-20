import { describe, it, expect } from 'vitest'

import { PROCESSING_TYPES } from './meta-fields.js'
import { processingTypeForRegistration } from './processing-type-for-registration.js'
import {
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

const exporter = { wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER }
const reprocessorInput = {
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.INPUT
}
const reprocessorOutput = {
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.OUTPUT
}

describe('processingTypeForRegistration', () => {
  it('reads an accredited exporter under the exporter template', () => {
    expect(processingTypeForRegistration(exporter, { accredited: true })).toBe(
      PROCESSING_TYPES.EXPORTER
    )
  })

  it('reads an accredited reprocessor under the template for its reprocessing type', () => {
    expect(
      processingTypeForRegistration(reprocessorInput, { accredited: true })
    ).toBe(PROCESSING_TYPES.REPROCESSOR_INPUT)
    expect(
      processingTypeForRegistration(reprocessorOutput, { accredited: true })
    ).toBe(PROCESSING_TYPES.REPROCESSOR_OUTPUT)
  })

  it('reads an unaccredited registration under the registered-only variant', () => {
    expect(processingTypeForRegistration(exporter, { accredited: false })).toBe(
      PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
    )
    expect(
      processingTypeForRegistration(reprocessorInput, { accredited: false })
    ).toBe(PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY)
  })

  it('ignores reprocessing type when the registration is not accredited, since one registered-only template serves both', () => {
    expect(
      processingTypeForRegistration(reprocessorOutput, { accredited: false })
    ).toBe(PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY)
  })

  it('rejects an accredited reprocessor with no reprocessing type, which cannot name a template', () => {
    expect(() =>
      processingTypeForRegistration(
        { wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR },
        { accredited: true }
      )
    ).toThrow(/reprocessingType/)
  })

  it('rejects a waste processing type it has no template for', () => {
    expect(() =>
      processingTypeForRegistration(
        /** @type {*} */ ({ wasteProcessingType: 'incinerator' }),
        { accredited: true }
      )
    ).toThrow(/incinerator/)
  })
})
