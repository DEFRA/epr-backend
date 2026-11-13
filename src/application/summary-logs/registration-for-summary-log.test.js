import { CADENCE } from '#reports/domain/cadence.js'
import { OPERATOR_CATEGORY } from '#reports/domain/operator-category.js'
import {
  operatorCategoryOf,
  reportingCadenceOf
} from './registration-for-summary-log.js'

/**
 * @param {string | null} status - the accreditation's status today, or none
 * @param {string} [wasteProcessingType]
 */
const registrationWith = (status, wasteProcessingType = 'reprocessor') =>
  /** @type {any} */ ({
    wasteProcessingType,
    accreditation: status && {
      accreditationNumber: 'ACC12345',
      status: { current: status, timeline: [] }
    }
  })

describe('reportingCadenceOf', () => {
  it.each([
    ['approved', CADENCE.monthly],
    ['suspended', CADENCE.monthly],
    ['cancelled', CADENCE.quarterly],
    [null, CADENCE.quarterly]
  ])('reports a %s accreditation %s', (status, cadence) => {
    expect(reportingCadenceOf(registrationWith(status))).toBe(cadence)
  })
})

describe('operatorCategoryOf', () => {
  it.each([
    ['reprocessor', 'approved', OPERATOR_CATEGORY.REPROCESSOR],
    ['reprocessor', null, OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY],
    ['exporter', 'suspended', OPERATOR_CATEGORY.EXPORTER],
    ['exporter', 'cancelled', OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY]
  ])(
    'categorises a %s with a %s accreditation as %s',
    (wasteProcessingType, status, category) => {
      expect(
        operatorCategoryOf(registrationWith(status, wasteProcessingType))
      ).toBe(category)
    }
  )
})
