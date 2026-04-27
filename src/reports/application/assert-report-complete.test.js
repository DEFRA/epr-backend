import { OPERATOR_CATEGORY } from '#reports/domain/operator-category.js'
import { describe, expect, it } from 'vitest'
import { assertReportComplete } from './assert-report-complete.js'

/**
 * @import { Report } from '#reports/repository/port.js'
 * @import { OperatorCategory } from '#reports/domain/operator-category.js'
 * @typedef {Record<string, any>} SparseReport
 */

/**
 * @param {SparseReport} report
 * @param {OperatorCategory | string} category
 * @returns {string[]}
 */
const getMissing = (report, category) => {
  try {
    assertReportComplete(
      /** @type {Report} */ (/** @type {unknown} */ (report)),
      /** @type {OperatorCategory} */ (category)
    )
  } catch (err) {
    if (err?.isBoom) return err.output.payload.missingFields
    throw err
  }
  return []
}

describe('assertReportComplete', () => {
  it('should throw for unknown operator category', () => {
    expect(() => getMissing({}, 'UNKNOWN')).toThrow()
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

    expect(getMissing(reportWithExtras, OPERATOR_CATEGORY.REPROCESSOR)).toEqual(
      []
    )
  })

  it('should report the block name when a required block is null', () => {
    expect(
      getMissing(
        { recyclingActivity: null },
        OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY
      )
    ).toEqual(['recyclingActivity'])
  })

  describe('REPROCESSOR_REGISTERED_ONLY', () => {
    const category = OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY

    it('should require recyclingActivity.tonnageRecycled and recyclingActivity.tonnageNotRecycled', () => {
      expect(getMissing({ recyclingActivity: {} }, category)).toEqual([
        'recyclingActivity.tonnageRecycled',
        'recyclingActivity.tonnageNotRecycled'
      ])
    })

    it('should be complete when all required fields are populated', () => {
      expect(
        getMissing(
          {
            recyclingActivity: { tonnageRecycled: 100, tonnageNotRecycled: 10 }
          },
          category
        )
      ).toEqual([])
    })
  })

  describe('REPROCESSOR', () => {
    const category = OPERATOR_CATEGORY.REPROCESSOR

    it('should require recycling and prn manual-entry fields', () => {
      expect(getMissing({ recyclingActivity: {}, prn: {} }, category)).toEqual([
        'recyclingActivity.tonnageRecycled',
        'recyclingActivity.tonnageNotRecycled',
        'prn.totalRevenue',
        'prn.freeTonnage'
      ])
    })

    it('should be complete when all required fields are populated', () => {
      expect(
        getMissing(
          {
            recyclingActivity: {
              tonnageRecycled: 100,
              tonnageNotRecycled: 10
            },
            prn: { totalRevenue: 1000, freeTonnage: 0 }
          },
          category
        )
      ).toEqual([])
    })
  })

  describe('EXPORTER_REGISTERED_ONLY', () => {
    const category = OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY

    it('should require exportActivity.tonnageReceivedNotExported', () => {
      expect(getMissing({ exportActivity: {} }, category)).toEqual([
        'exportActivity.tonnageReceivedNotExported'
      ])
    })

    it('should be complete when all required fields are populated', () => {
      expect(
        getMissing(
          { exportActivity: { tonnageReceivedNotExported: 5 } },
          category
        )
      ).toEqual([])
    })
  })

  describe('EXPORTER', () => {
    const category = OPERATOR_CATEGORY.EXPORTER

    it('should require export and prn manual-entry fields', () => {
      expect(getMissing({ exportActivity: {}, prn: {} }, category)).toEqual([
        'exportActivity.tonnageReceivedNotExported',
        'prn.totalRevenue',
        'prn.freeTonnage'
      ])
    })

    it('should be complete when all required fields are populated', () => {
      expect(
        getMissing(
          {
            exportActivity: { tonnageReceivedNotExported: 5 },
            prn: { totalRevenue: 1000, freeTonnage: 0 }
          },
          category
        )
      ).toEqual([])
    })
  })

  describe('code and event for indexed logging', () => {
    /** @import { EnrichedBoom } from '#common/types/enriched-boom.js' */
    /**
     * @param {SparseReport} report
     * @param {OperatorCategory} category
     * @returns {EnrichedBoom}
     */
    const captureBoom = (report, category) => {
      try {
        assertReportComplete(
          /** @type {Report} */ (/** @type {unknown} */ (report)),
          category
        )
        throw new Error('expected throw')
      } catch (err) {
        return /** @type {EnrichedBoom} */ (err)
      }
    }

    it('attaches code REPORT_INCOMPLETE and flat event.reason referencing report.id', () => {
      const boom = captureBoom(
        {
          id: 'rep-42',
          recyclingActivity: {}
        },
        OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY
      )

      expect(boom.code).toBe('report_incomplete')
      expect(boom.event).toEqual({
        action: 'update_report_status',
        reason:
          'missingCount=2 missingFields=[recyclingActivity.tonnageRecycled,recyclingActivity.tonnageNotRecycled]',
        reference: 'rep-42'
      })
    })
  })
})
