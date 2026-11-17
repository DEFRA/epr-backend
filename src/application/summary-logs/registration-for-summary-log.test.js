import { toYear } from '#common/helpers/dates/year.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import {
  buildReadAccreditation,
  buildReadExporterRegistration,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
import { CADENCE } from '#reports/domain/cadence.js'
import {
  OPERATOR_CATEGORY,
  reportOperatorCategory
} from '#reports/domain/operator-category.js'
import { reportingCadenceOf } from './registration-for-summary-log.js'

/** @import {AccreditationCommon, Registration} from '#organisation-read-model/domain/model.js' */
/** @import {SummaryLogRegistration} from './registration-for-summary-log.js' */

/**
 * @param {AccreditationCommon['status']['current'] | null} status - the accreditation's status today, or none
 * @param {() => Registration} [build]
 * @returns {SummaryLogRegistration}
 */
const registrationWith = (status, build = buildReadReprocessorRegistration) => {
  const found = {
    registrationNumber: toRegistrationNumber('REG12345'),
    registration: build()
  }
  return status === null
    ? { ...found, year: null, accreditation: null }
    : {
        ...found,
        year: toYear(2026),
        accreditation: buildReadAccreditation({
          status: {
            current: status,
            lastUpdatedAt: '2026-01-01T00:00:00.000Z',
            timeline: [{ status, at: '2026-01-01T00:00:00.000Z' }]
          }
        })
      }
}

describe('reportingCadenceOf', () => {
  it.each(
    /** @type {const} */ ([
      ['approved', CADENCE.monthly],
      ['suspended', CADENCE.monthly],
      ['cancelled', CADENCE.quarterly],
      [null, CADENCE.quarterly]
    ])
  )('reports a %s accreditation %s', (status, cadence) => {
    expect(reportingCadenceOf(registrationWith(status))).toBe(cadence)
  })
})

describe('operator category of a summary log registration', () => {
  const reprocessor = buildReadReprocessorRegistration
  const exporter = buildReadExporterRegistration

  it.each(
    /** @type {const} */ ([
      {
        operator: 'reprocessor',
        build: reprocessor,
        status: 'approved',
        category: OPERATOR_CATEGORY.REPROCESSOR
      },
      {
        operator: 'reprocessor',
        build: reprocessor,
        status: null,
        category: OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY
      },
      {
        operator: 'exporter',
        build: exporter,
        status: 'suspended',
        category: OPERATOR_CATEGORY.EXPORTER
      },
      {
        operator: 'exporter',
        build: exporter,
        status: 'cancelled',
        category: OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY
      }
    ])
  )(
    'categorises a $operator with a $status accreditation as $category',
    ({ build, status, category }) => {
      expect(reportOperatorCategory(registrationWith(status, build))).toBe(
        category
      )
    }
  )
})
