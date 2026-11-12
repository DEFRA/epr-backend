import { describe, expect, it } from 'vitest'

import { PROCESSING_TYPES } from './meta-fields.js'
import { templateForRegistration } from './template-for-registration.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { toYear } from '#common/helpers/dates/year.js'

/** @import { TemplateRegistration } from './template-for-registration.js' */
/** @import { ProcessingType } from './meta-fields.js' */

const accreditation = { accreditationNumber: toAccreditationNumber('ACC-1') }

/** @type {[string, TemplateRegistration, ProcessingType, number][]} */
const cases = [
  [
    'accredited reprocessor input',
    {
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'input',
      accreditation
    },
    PROCESSING_TYPES.REPROCESSOR_INPUT,
    5
  ],
  [
    'accredited reprocessor output',
    {
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'output',
      accreditation
    },
    PROCESSING_TYPES.REPROCESSOR_OUTPUT,
    5
  ],
  [
    'accredited exporter',
    { wasteProcessingType: 'exporter', accreditation },
    PROCESSING_TYPES.EXPORTER,
    5
  ],
  [
    'registered-only reprocessor',
    {
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'input',
      accreditation: null
    },
    PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
    2.1
  ],
  [
    'registered-only exporter',
    { wasteProcessingType: 'exporter', accreditation: null },
    PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
    2.1
  ]
]

describe('templateForRegistration', () => {
  it('refuses a registration no template fits', () => {
    expect(() =>
      templateForRegistration(
        {
          wasteProcessingType: 'reprocessor',
          accreditation
        },
        toYear(2026)
      )
    ).toThrow('No summary log template fits the registration')
  })

  it.each(cases)(
    'names the 2026 template an %s would fill in',
    (_label, registration, processingType, templateVersion) => {
      expect(templateForRegistration(registration, toYear(2026))).toEqual({
        PROCESSING_TYPE: processingType,
        TEMPLATE_VERSION: templateVersion
      })
    }
  )

  it.each(cases)(
    'names the 2026 template an %s would fill in for a year with none',
    (_label, registration, processingType, templateVersion) => {
      expect(templateForRegistration(registration, toYear(2025))).toEqual({
        PROCESSING_TYPE: processingType,
        TEMPLATE_VERSION: templateVersion
      })
    }
  )

  it.each(cases)(
    'names the 2027 template an %s would fill in',
    (_label, registration, processingType) => {
      expect(templateForRegistration(registration, toYear(2027))).toEqual({
        PROCESSING_TYPE: processingType,
        TEMPLATE_VERSION: 2027.01
      })
    }
  )
})
