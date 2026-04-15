import { describe, expect, it } from 'vitest'
import {
  completenessRequirements,
  isReportComplete
} from './is-report-complete.js'
import { OPERATOR_CATEGORY } from './operator-category.js'

/**
 * @import { Report } from '#reports/repository/port.js'
 * @import { OperatorCategory } from './operator-category.js'
 * @typedef {Record<string, any>} SparseReport
 */

// A report is complete when all manual-entry fields required for its operator
// category are non-null. Matrix:
//
// | Field                                    | RR | R  | ER | E  |
// |------------------------------------------|----|----|----|----|
// | recyclingActivity.tonnageRecycled        | ✔  | ✔  | —  | —  |
// | recyclingActivity.tonnageNotRecycled     | ✔  | ✔  | —  | —  |
// | exportActivity.tonnageReceivedNotExported| —  | —  | ✔  | ✔  |
// | prn.totalRevenue                         | —  | ✔  | —  | ✔  |
// | prn.freeTonnage                          | —  | ✔  | —  | ✔  |
//
// RR = REPROCESSOR_REGISTERED_ONLY, R = REPROCESSOR,
// ER = EXPORTER_REGISTERED_ONLY,    E = EXPORTER.

const ALL_FIELDS = [...new Set(Object.values(completenessRequirements).flat())]

/** @type {SparseReport} */
const completeReport = {
  recyclingActivity: { tonnageRecycled: 100, tonnageNotRecycled: 10 },
  exportActivity: { tonnageReceivedNotExported: 5 },
  prn: { totalRevenue: 1000, freeTonnage: 0 }
}

/**
 * @param {SparseReport} report
 * @param {OperatorCategory | string} category
 */
const check = (report, category) =>
  isReportComplete(
    /** @type {Report} */ (/** @type {unknown} */ (report)),
    /** @type {OperatorCategory} */ (category)
  )

describe('isReportComplete', () => {
  describe.each(
    /** @type {[OperatorCategory, string[]][]} */ (
      Object.entries(completenessRequirements)
    )
  )('%s', (category, requiredFields) => {
    it('is complete when all fields are populated', () => {
      expect(check(completeReport, category)).toBe(true)
    })

    it.each(ALL_FIELDS)(
      'when %s is null, is complete only when the field is not required for this category',
      (field) => {
        const [section, prop] = field.split('.')
        const report = {
          ...completeReport,
          [section]: { ...completeReport[section], [prop]: null }
        }

        expect(check(report, category)).toBe(!requiredFields.includes(field))
      }
    )
  })

  it.each([
    {
      name: 'exportActivity null on accredited exporter',
      patch: { exportActivity: null },
      category: OPERATOR_CATEGORY.EXPORTER,
      expected: false
    },
    {
      name: 'prn null on accredited reprocessor',
      patch: { prn: null },
      category: OPERATOR_CATEGORY.REPROCESSOR,
      expected: false
    },
    {
      name: 'prn null on registered-only reprocessor',
      patch: { prn: null },
      category: OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY,
      expected: true
    }
  ])('missing section: $name -> $expected', ({ patch, category, expected }) => {
    expect(check({ ...completeReport, ...patch }, category)).toBe(expected)
  })

  it('throws for unknown operator category', () => {
    expect(() => check(completeReport, 'UNKNOWN')).toThrow()
  })

  it('should ignore unrelated fields on real reports', () => {
    const reportWithExtras = {
      ...completeReport,
      recyclingActivity: {
        ...completeReport.recyclingActivity,
        suppliers: [{ supplierName: 'Acme' }],
        totalTonnageReceived: 500
      },
      exportActivity: {
        ...completeReport.exportActivity,
        tonnageRefusedAtDestination: 2
      },
      prn: { ...completeReport.prn, issuedTonnage: 50 },
      source: { summaryLogId: 'abc', lastUploadedAt: null },
      supportingInformation: 'notes'
    }

    expect(check(reportWithExtras, OPERATOR_CATEGORY.REPROCESSOR)).toBe(true)
  })
})
