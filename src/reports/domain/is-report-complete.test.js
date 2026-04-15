import { describe, expect, it } from 'vitest'
import { isReportComplete } from './is-report-complete.js'
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
  describe('REPROCESSOR_REGISTERED_ONLY', () => {
    const category = OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY

    /** @type {SparseReport} */
    const report = {
      recyclingActivity: { tonnageRecycled: 100, tonnageNotRecycled: 10 }
    }

    it('should be complete when recycling fields are populated', () => {
      expect(check(report, category)).toBe(true)
    })

    it('should be incomplete when recyclingActivity is null', () => {
      expect(check({ ...report, recyclingActivity: null }, category)).toBe(
        false
      )
    })

    it('should be incomplete when tonnageRecycled is null', () => {
      const incomplete = {
        ...report,
        recyclingActivity: {
          ...report.recyclingActivity,
          tonnageRecycled: null
        }
      }

      expect(check(incomplete, category)).toBe(false)
    })

    it('should be incomplete when tonnageNotRecycled is null', () => {
      const incomplete = {
        ...report,
        recyclingActivity: {
          ...report.recyclingActivity,
          tonnageNotRecycled: null
        }
      }

      expect(check(incomplete, category)).toBe(false)
    })
  })

  describe('REPROCESSOR', () => {
    const category = OPERATOR_CATEGORY.REPROCESSOR

    /** @type {SparseReport} */
    const report = {
      recyclingActivity: { tonnageRecycled: 100, tonnageNotRecycled: 10 },
      prn: { totalRevenue: 1000, freeTonnage: 0 }
    }

    it('should be complete when recycling and prn fields are populated', () => {
      expect(check(report, category)).toBe(true)
    })

    it('should be incomplete when recyclingActivity is null', () => {
      expect(check({ ...report, recyclingActivity: null }, category)).toBe(
        false
      )
    })

    it('should be incomplete when tonnageRecycled is null', () => {
      const incomplete = {
        ...report,
        recyclingActivity: {
          ...report.recyclingActivity,
          tonnageRecycled: null
        }
      }

      expect(check(incomplete, category)).toBe(false)
    })

    it('should be incomplete when tonnageNotRecycled is null', () => {
      const incomplete = {
        ...report,
        recyclingActivity: {
          ...report.recyclingActivity,
          tonnageNotRecycled: null
        }
      }

      expect(check(incomplete, category)).toBe(false)
    })

    it('should be incomplete when prn is null', () => {
      expect(check({ ...report, prn: null }, category)).toBe(false)
    })

    it('should be incomplete when prn.totalRevenue is null', () => {
      const incomplete = {
        ...report,
        prn: { ...report.prn, totalRevenue: null }
      }

      expect(check(incomplete, category)).toBe(false)
    })

    it('should be incomplete when prn.freeTonnage is null', () => {
      const incomplete = {
        ...report,
        prn: { ...report.prn, freeTonnage: null }
      }

      expect(check(incomplete, category)).toBe(false)
    })
  })

  describe('EXPORTER_REGISTERED_ONLY', () => {
    const category = OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY

    /** @type {SparseReport} */
    const report = {
      exportActivity: { tonnageReceivedNotExported: 5 }
    }

    it('should be complete when export fields are populated', () => {
      expect(check(report, category)).toBe(true)
    })

    it('should be incomplete when exportActivity is null', () => {
      expect(check({ ...report, exportActivity: null }, category)).toBe(false)
    })

    it('should be incomplete when tonnageReceivedNotExported is null', () => {
      const incomplete = {
        ...report,
        exportActivity: {
          ...report.exportActivity,
          tonnageReceivedNotExported: null
        }
      }

      expect(check(incomplete, category)).toBe(false)
    })
  })

  describe('EXPORTER', () => {
    const category = OPERATOR_CATEGORY.EXPORTER

    /** @type {SparseReport} */
    const report = {
      exportActivity: { tonnageReceivedNotExported: 5 },
      prn: { totalRevenue: 1000, freeTonnage: 0 }
    }

    it('should be complete when export and prn fields are populated', () => {
      expect(check(report, category)).toBe(true)
    })

    it('should be incomplete when exportActivity is null', () => {
      expect(check({ ...report, exportActivity: null }, category)).toBe(false)
    })

    it('should be incomplete when tonnageReceivedNotExported is null', () => {
      const incomplete = {
        ...report,
        exportActivity: {
          ...report.exportActivity,
          tonnageReceivedNotExported: null
        }
      }

      expect(check(incomplete, category)).toBe(false)
    })

    it('should be incomplete when prn is null', () => {
      expect(check({ ...report, prn: null }, category)).toBe(false)
    })

    it('should be incomplete when prn.totalRevenue is null', () => {
      const incomplete = {
        ...report,
        prn: { ...report.prn, totalRevenue: null }
      }

      expect(check(incomplete, category)).toBe(false)
    })

    it('should be incomplete when prn.freeTonnage is null', () => {
      const incomplete = {
        ...report,
        prn: { ...report.prn, freeTonnage: null }
      }

      expect(check(incomplete, category)).toBe(false)
    })
  })

  it('should throw for unknown operator category', () => {
    expect(() => check({}, 'UNKNOWN')).toThrow()
  })

  it('should ignore unrelated fields on real reports', () => {
    /** @type {SparseReport} */
    const reportWithExtras = {
      recyclingActivity: {
        tonnageRecycled: 100,
        tonnageNotRecycled: 10,
        suppliers: [{ supplierName: 'Acme' }],
        totalTonnageReceived: 500
      },
      exportActivity: {
        tonnageReceivedNotExported: 5,
        tonnageRefusedAtDestination: 2
      },
      prn: { totalRevenue: 1000, freeTonnage: 0, issuedTonnage: 50 },
      source: { summaryLogId: 'abc', lastUploadedAt: null },
      supportingInformation: 'notes'
    }

    expect(check(reportWithExtras, OPERATOR_CATEGORY.REPROCESSOR)).toBe(true)
  })
})
