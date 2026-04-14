import { describe, it, expect } from 'vitest'
import { isReportComplete } from './is-report-complete.js'
import { OPERATOR_CATEGORY } from './operator-category.js'

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

const FIELDS = {
  tonnageRecycled: 'recyclingActivity.tonnageRecycled',
  tonnageNotRecycled: 'recyclingActivity.tonnageNotRecycled',
  tonnageReceivedNotExported: 'exportActivity.tonnageReceivedNotExported',
  prnTotalRevenue: 'prn.totalRevenue',
  prnFreeTonnage: 'prn.freeTonnage'
}

const REQUIRED_BY_CATEGORY = {
  [OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY]: [
    FIELDS.tonnageRecycled,
    FIELDS.tonnageNotRecycled
  ],
  [OPERATOR_CATEGORY.REPROCESSOR]: [
    FIELDS.tonnageRecycled,
    FIELDS.tonnageNotRecycled,
    FIELDS.prnTotalRevenue,
    FIELDS.prnFreeTonnage
  ],
  [OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY]: [
    FIELDS.tonnageReceivedNotExported
  ],
  [OPERATOR_CATEGORY.EXPORTER]: [
    FIELDS.tonnageReceivedNotExported,
    FIELDS.prnTotalRevenue,
    FIELDS.prnFreeTonnage
  ]
}

const completeReport = {
  recyclingActivity: { tonnageRecycled: 100, tonnageNotRecycled: 10 },
  exportActivity: { tonnageReceivedNotExported: 5 },
  prn: { totalRevenue: 1000, freeTonnage: 0 }
}

const withFieldNulled = (report, path) => {
  const [section, prop] = path.split('.')
  return {
    ...report,
    [section]: { ...(report[section] ?? {}), [prop]: null }
  }
}

describe('isReportComplete', () => {
  describe.each(Object.entries(REQUIRED_BY_CATEGORY))(
    '%s',
    (category, requiredFields) => {
      it('is complete when all fields are populated', () => {
        expect(isReportComplete(completeReport, category)).toBe(true)
      })

      it.each(Object.values(FIELDS))(
        'when %s is null, is complete iff the field is not required for this category',
        (field) => {
          const report = withFieldNulled(completeReport, field)
          const expected = !requiredFields.includes(field)
          expect(isReportComplete(report, category)).toBe(expected)
        }
      )
    }
  )

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
    expect(isReportComplete({ ...completeReport, ...patch }, category)).toBe(
      expected
    )
  })

  it('throws for unknown operator category', () => {
    expect(() => isReportComplete(completeReport, 'UNKNOWN')).toThrow()
  })
})
