import { describe, expect, it } from 'vitest'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { QUARTERLY } from './cadence.js'
import { OPERATOR_CATEGORY } from './operator-category.js'
import { aggregateReportDetail } from './aggregate-report-detail.js'

const buildReceivedRecord = (overrides = {}) => ({
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    MONTH_RECEIVED_FOR_REPROCESSING: '2026-01-01',
    TONNAGE_RECEIVED_FOR_RECYCLING: 50,
    SUPPLIER_NAME: 'Grantham Waste',
    ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler',
    ...overrides
  },
  versions: [
    {
      createdAt: '2026-02-10T09:00:00.000Z',
      summaryLog: { id: 'sl-1' }
    }
  ]
})

const buildSentOnRecord = (overrides = {}) => ({
  type: WASTE_RECORD_TYPE.SENT_ON,
  data: {
    DATE_LOAD_LEFT_SITE: '2026-02-15',
    TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 10,
    FINAL_DESTINATION_FACILITY_TYPE: 'Reprocessor',
    FINAL_DESTINATION_NAME: 'Lincoln recycling',
    ...overrides
  },
  versions: [
    {
      createdAt: '2026-02-10T09:00:00.000Z',
      summaryLog: { id: 'sl-1' }
    }
  ]
})

describe('#aggregateReportDetail', () => {
  const defaultArgs = {
    operatorCategory: OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY,
    cadence: QUARTERLY,
    year: 2026,
    period: 1
  }

  describe('period metadata', () => {
    it('returns year, period, cadence and date range', () => {
      const result = aggregateReportDetail([], defaultArgs)

      expect(result.operatorCategory).toBe('REPROCESSOR_REGISTERED_ONLY')
      expect(result.cadence).toBe('quarterly')
      expect(result.year).toBe(2026)
      expect(result.period).toBe(1)
      expect(result.startDate).toBe('2026-01-01')
      expect(result.endDate).toBe('2026-03-31')
    })

    it('computes date range for period 2', () => {
      const result = aggregateReportDetail([], {
        ...defaultArgs,
        period: 2
      })

      expect(result.startDate).toBe('2026-04-01')
      expect(result.endDate).toBe('2026-06-30')
    })

    it('computes date range for period 4', () => {
      const result = aggregateReportDetail([], {
        ...defaultArgs,
        period: 4
      })

      expect(result.startDate).toBe('2026-10-01')
      expect(result.endDate).toBe('2026-12-31')
    })
  })

  describe('lastUploadedAt', () => {
    it('returns null when no waste records match', () => {
      const result = aggregateReportDetail([], defaultArgs)

      expect(result.lastUploadedAt).toBeNull()
    })

    it('uses the latest waste record version timestamp when multiple records exist', () => {
      const records = [
        buildReceivedRecord(),
        {
          ...buildReceivedRecord({
            MONTH_RECEIVED_FOR_REPROCESSING: '2026-02-01',
            TONNAGE_RECEIVED_FOR_RECYCLING: 30
          }),
          versions: [
            {
              createdAt: '2026-02-15T15:09:00.000Z',
              summaryLog: { id: 'sl-2' }
            }
          ]
        }
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.lastUploadedAt).toBe('2026-02-15T15:09:00.000Z')
    })

    it('uses the latest waste record version timestamp across received and sentOn records', () => {
      const records = [
        buildReceivedRecord(),
        {
          ...buildSentOnRecord(),
          versions: [
            {
              createdAt: '2026-03-01T12:00:00.000Z',
              summaryLog: { id: 'sl-3' }
            }
          ]
        }
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.lastUploadedAt).toBe('2026-03-01T12:00:00.000Z')
    })
  })

  describe('waste received', () => {
    it('returns zero tonnage when no received records match', () => {
      const result = aggregateReportDetail([], defaultArgs)

      expect(result.sections.wasteReceived.totalTonnage).toBe(0)
      expect(result.sections.wasteReceived.suppliers).toStrictEqual([])
    })

    it('sums tonnage from received records in the period', () => {
      const records = [
        buildReceivedRecord({
          TONNAGE_RECEIVED_FOR_RECYCLING: 42.21
        }),
        buildReceivedRecord({
          MONTH_RECEIVED_FOR_REPROCESSING: '2026-03-01',
          TONNAGE_RECEIVED_FOR_RECYCLING: 38.04
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteReceived.totalTonnage).toBe(80.25)
    })

    it('excludes received records outside the period', () => {
      const records = [
        buildReceivedRecord({
          TONNAGE_RECEIVED_FOR_RECYCLING: 50
        }),
        buildReceivedRecord({
          MONTH_RECEIVED_FOR_REPROCESSING: '2026-04-01',
          TONNAGE_RECEIVED_FOR_RECYCLING: 100
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteReceived.totalTonnage).toBe(50)
    })

    it('builds supplier entries with name, role and tonnage', () => {
      const records = [
        buildReceivedRecord({
          SUPPLIER_NAME: 'Grantham Waste',
          ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler',
          TONNAGE_RECEIVED_FOR_RECYCLING: 42.21
        }),
        buildReceivedRecord({
          MONTH_RECEIVED_FOR_REPROCESSING: '2026-02-01',
          SUPPLIER_NAME: 'SUEZ recycling',
          ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorter',
          TONNAGE_RECEIVED_FOR_RECYCLING: 38.04
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteReceived.suppliers).toStrictEqual([
        { supplierName: 'Grantham Waste', role: 'Baler', tonnage: 42.21 },
        { supplierName: 'SUEZ recycling', role: 'Sorter', tonnage: 38.04 }
      ])
    })

    it('only includes received records in waste received totals', () => {
      const records = [
        buildReceivedRecord({ TONNAGE_RECEIVED_FOR_RECYCLING: 50 }),
        buildSentOnRecord({ TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 999 })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteReceived.totalTonnage).toBe(50)
    })
  })

  describe('waste sent on', () => {
    it('returns zero tonnage when no sentOn records match', () => {
      const result = aggregateReportDetail([], defaultArgs)

      expect(result.sections.wasteSentOn.totalTonnage).toBe(0)
      expect(result.sections.wasteSentOn.toReprocessors).toBe(0)
      expect(result.sections.wasteSentOn.toExporters).toBe(0)
      expect(result.sections.wasteSentOn.toOtherSites).toBe(0)
      expect(result.sections.wasteSentOn.destinations).toStrictEqual([])
    })

    it('sums tonnage from sentOn records in the period', () => {
      const records = [
        buildSentOnRecord({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5.5
        }),
        buildSentOnRecord({
          DATE_LOAD_LEFT_SITE: '2026-03-10',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 4.5
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteSentOn.totalTonnage).toBe(10)
    })

    it('excludes sentOn records outside the period', () => {
      const records = [
        buildSentOnRecord({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 10
        }),
        buildSentOnRecord({
          DATE_LOAD_LEFT_SITE: '2026-04-01',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 99
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteSentOn.totalTonnage).toBe(10)
    })

    it('breaks down tonnage by facility type', () => {
      const records = [
        buildSentOnRecord({
          FINAL_DESTINATION_FACILITY_TYPE: 'Reprocessor',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5
        }),
        buildSentOnRecord({
          DATE_LOAD_LEFT_SITE: '2026-02-01',
          FINAL_DESTINATION_FACILITY_TYPE: 'Exporter',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 3
        }),
        buildSentOnRecord({
          DATE_LOAD_LEFT_SITE: '2026-03-01',
          FINAL_DESTINATION_FACILITY_TYPE: 'Other',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 2
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteSentOn.toReprocessors).toBe(5)
      expect(result.sections.wasteSentOn.toExporters).toBe(3)
      expect(result.sections.wasteSentOn.toOtherSites).toBe(2)
    })

    it('classifies unknown facility types as other sites', () => {
      const records = [
        buildSentOnRecord({
          FINAL_DESTINATION_FACILITY_TYPE: 'Something unexpected',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 7
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteSentOn.toOtherSites).toBe(7)
      expect(result.sections.wasteSentOn.toReprocessors).toBe(0)
      expect(result.sections.wasteSentOn.toExporters).toBe(0)
    })

    it('builds destination entries with name, role and tonnage', () => {
      const records = [
        buildSentOnRecord({
          FINAL_DESTINATION_NAME: 'Lincoln recycling',
          FINAL_DESTINATION_FACILITY_TYPE: 'Reprocessor',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 8
        }),
        buildSentOnRecord({
          DATE_LOAD_LEFT_SITE: '2026-02-01',
          FINAL_DESTINATION_NAME: 'Thames exports',
          FINAL_DESTINATION_FACILITY_TYPE: 'Exporter',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 2
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteSentOn.destinations).toStrictEqual([
        {
          recipientName: 'Lincoln recycling',
          role: 'Reprocessor',
          tonnage: 8
        },
        { recipientName: 'Thames exports', role: 'Exporter', tonnage: 2 }
      ])
    })

    it('only includes sentOn records in waste sent on totals', () => {
      const records = [
        buildSentOnRecord({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 10
        }),
        buildReceivedRecord({ TONNAGE_RECEIVED_FOR_RECYCLING: 999 })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteSentOn.totalTonnage).toBe(10)
    })
  })

  describe('unvalidated data (registered-only validation is placeholder)', () => {
    it('treats non-numeric tonnage as zero', () => {
      const records = [
        buildReceivedRecord({
          TONNAGE_RECEIVED_FOR_RECYCLING: 'not a number'
        }),
        buildReceivedRecord({
          MONTH_RECEIVED_FOR_REPROCESSING: '2026-02-01',
          TONNAGE_RECEIVED_FOR_RECYCLING: 50
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteReceived.totalTonnage).toBe(50)
    })

    it('returns empty section when operator category has no date fields for a record type', () => {
      const records = [buildReceivedRecord()]

      const result = aggregateReportDetail(records, {
        ...defaultArgs,
        operatorCategory: OPERATOR_CATEGORY.EXPORTER
      })

      expect(result.sections.wasteReceived.totalTonnage).toBe(0)
      expect(result.sections.wasteReceived.suppliers).toEqual([])
    })

    it('excludes records with missing date fields from all periods', () => {
      const records = [
        {
          type: WASTE_RECORD_TYPE.RECEIVED,
          data: {
            TONNAGE_RECEIVED_FOR_RECYCLING: 100,
            SUPPLIER_NAME: 'Test',
            ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
          },
          versions: [
            {
              createdAt: '2026-01-01T00:00:00.000Z',
              summaryLog: { id: 'sl-1' }
            }
          ]
        }
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.sections.wasteReceived.totalTonnage).toBe(0)
    })
  })
})
