import { describe, expect, it } from 'vitest'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { OPERATOR_CATEGORY } from '../operator-category.js'
import { aggregateReportDetail } from './aggregate-report-detail.js'

const buildReceivedRecord = (overrides = {}) => ({
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    MONTH_RECEIVED_FOR_REPROCESSING: '2026-01',
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
    cadence: 'quarterly',
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

  describe('lastUploadedAt and source', () => {
    it('returns null when no waste records match', () => {
      const result = aggregateReportDetail([], defaultArgs)

      expect(result.source.summaryLogId).toBeNull()
      expect(result.source.lastUploadedAt).toBeNull()
    })

    it('uses the latest waste record version timestamp when multiple records exist', () => {
      const records = [
        buildReceivedRecord(),
        {
          ...buildReceivedRecord({
            MONTH_RECEIVED_FOR_REPROCESSING: '2026-02',
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

      expect(result.source.lastUploadedAt).toBe('2026-02-15T15:09:00.000Z')
      expect(result.source.summaryLogId).toBe('sl-2')
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

      expect(result.source.lastUploadedAt).toBe('2026-03-01T12:00:00.000Z')
      expect(result.source.summaryLogId).toBe('sl-3')
    })
  })

  describe('waste received', () => {
    it('returns zero tonnage when no received records match', () => {
      const result = aggregateReportDetail([], defaultArgs)

      expect(result.recyclingActivity.totalTonnageReceived).toBe(0)
      expect(result.recyclingActivity.suppliers).toStrictEqual([])
    })

    it('sums tonnage from received records in the period', () => {
      const records = [
        buildReceivedRecord({
          TONNAGE_RECEIVED_FOR_RECYCLING: 42.21
        }),
        buildReceivedRecord({
          MONTH_RECEIVED_FOR_REPROCESSING: '2026-03',
          TONNAGE_RECEIVED_FOR_RECYCLING: 38.04
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.recyclingActivity.totalTonnageReceived).toBe(80.25)
    })

    it('excludes received records outside the period', () => {
      const records = [
        buildReceivedRecord({
          TONNAGE_RECEIVED_FOR_RECYCLING: 50
        }),
        buildReceivedRecord({
          MONTH_RECEIVED_FOR_REPROCESSING: '2026-04',
          TONNAGE_RECEIVED_FOR_RECYCLING: 100
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.recyclingActivity.totalTonnageReceived).toBe(50)
    })

    it('builds supplier entries with name, facilityType and tonnageReceived', () => {
      const records = [
        buildReceivedRecord({
          SUPPLIER_NAME: 'Grantham Waste',
          ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler',
          TONNAGE_RECEIVED_FOR_RECYCLING: 42.21
        }),
        buildReceivedRecord({
          MONTH_RECEIVED_FOR_REPROCESSING: '2026-02',
          SUPPLIER_NAME: 'SUEZ recycling',
          ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorter',
          TONNAGE_RECEIVED_FOR_RECYCLING: 38.04
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.recyclingActivity.suppliers).toStrictEqual([
        {
          supplierName: 'Grantham Waste',
          facilityType: 'Baler',
          tonnageReceived: 42.21,
          supplierAddress: null,
          supplierPhone: null,
          supplierEmail: null
        },
        {
          supplierName: 'SUEZ recycling',
          facilityType: 'Sorter',
          tonnageReceived: 38.04,
          supplierAddress: null,
          supplierPhone: null,
          supplierEmail: null
        }
      ])
    })

    it('only includes received records in waste received totals', () => {
      const records = [
        buildReceivedRecord({ TONNAGE_RECEIVED_FOR_RECYCLING: 50 }),
        buildSentOnRecord({ TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 999 })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.recyclingActivity.totalTonnageReceived).toBe(50)
    })
  })

  describe('waste sent on', () => {
    it('returns zero tonnage when no sentOn records match', () => {
      const result = aggregateReportDetail([], defaultArgs)

      expect(result.wasteSent.tonnageSentToReprocessor).toBe(0)
      expect(result.wasteSent.tonnageSentToExporter).toBe(0)
      expect(result.wasteSent.tonnageSentToAnotherSite).toBe(0)
      expect(result.wasteSent.finalDestinations).toStrictEqual([])
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

      expect(result.wasteSent.tonnageSentToReprocessor).toBe(10)
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

      expect(result.wasteSent.tonnageSentToReprocessor).toBe(10)
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

      expect(result.wasteSent.tonnageSentToReprocessor).toBe(5)
      expect(result.wasteSent.tonnageSentToExporter).toBe(3)
      expect(result.wasteSent.tonnageSentToAnotherSite).toBe(2)
    })

    it('classifies unknown facility types as other sites', () => {
      const records = [
        buildSentOnRecord({
          FINAL_DESTINATION_FACILITY_TYPE: 'Something unexpected',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 7
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.wasteSent.tonnageSentToAnotherSite).toBe(7)
      expect(result.wasteSent.tonnageSentToReprocessor).toBe(0)
      expect(result.wasteSent.tonnageSentToExporter).toBe(0)
    })

    it('builds destination entries with name, facilityType and tonnageSentOn', () => {
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

      expect(result.wasteSent.finalDestinations).toStrictEqual([
        {
          recipientName: 'Lincoln recycling',
          facilityType: 'Reprocessor',
          address: null,
          tonnageSentOn: 8
        },
        {
          recipientName: 'Thames exports',
          facilityType: 'Exporter',
          address: null,
          tonnageSentOn: 2
        }
      ])
    })

    it('excludes records without a recipient name from finalDestinations', () => {
      const records = [
        buildSentOnRecord({
          FINAL_DESTINATION_NAME: 'Lincoln recycling',
          FINAL_DESTINATION_FACILITY_TYPE: 'Reprocessor',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 8
        }),
        buildSentOnRecord({
          DATE_LOAD_LEFT_SITE: '2026-02-01',
          FINAL_DESTINATION_NAME: undefined,
          FINAL_DESTINATION_FACILITY_TYPE: undefined,
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: undefined
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.wasteSent.finalDestinations).toStrictEqual([
        {
          recipientName: 'Lincoln recycling',
          facilityType: 'Reprocessor',
          address: null,
          tonnageSentOn: 8
        }
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

      expect(result.wasteSent.tonnageSentToReprocessor).toBe(10)
    })
  })

  describe('registered-only exporter', () => {
    const exporterArgs = {
      operatorCategory: OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY,
      cadence: 'quarterly',
      year: 2026,
      period: 1
    }

    const buildExporterReceivedRecord = (overrides = {}) => ({
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        MONTH_RECEIVED_FOR_EXPORT: '2026-01',
        TONNAGE_RECEIVED_FOR_EXPORT: 50,
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

    const buildExportedRecord = (overrides = {}) => ({
      type: WASTE_RECORD_TYPE.EXPORTED,
      data: {
        DATE_OF_EXPORT: '2026-01-15',
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5,
        OSR_NAME: 'EuroPlast Recycling GmbH',
        OSR_ID: '001',
        ...overrides
      },
      versions: [
        {
          createdAt: '2026-02-10T09:00:00.000Z',
          summaryLog: { id: 'sl-1' }
        }
      ]
    })

    it('uses TONNAGE_RECEIVED_FOR_EXPORT for waste received', () => {
      const records = [
        buildExporterReceivedRecord({ TONNAGE_RECEIVED_FOR_EXPORT: 42.21 }),
        buildExporterReceivedRecord({
          MONTH_RECEIVED_FOR_EXPORT: '2026-02',
          TONNAGE_RECEIVED_FOR_EXPORT: 38.04
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.recyclingActivity.totalTonnageReceived).toBe(80.25)
      expect(result.recyclingActivity.suppliers).toHaveLength(1)
    })

    it('returns wasteExported section with total tonnage', () => {
      const records = [
        buildExportedRecord({
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3.47
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-03-05',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.totalTonnageExported).toBe(11.47)
    })

    it('routes unresolved ORS IDs to unapprovedOverseasSites and keeps overseasSites empty', () => {
      const records = [
        buildExportedRecord({
          OSR_NAME: 'EuroPlast Recycling GmbH',
          OSR_ID: '001'
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          OSR_NAME: 'RecyclePlast SA',
          OSR_ID: '096'
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.overseasSites).toStrictEqual([])
      expect(result.exportActivity.unapprovedOverseasSites).toStrictEqual([
        { orsId: '001', tonnageExported: 5 },
        { orsId: '096', tonnageExported: 5 }
      ])
    })

    it('splits approved and unapproved ORS entries by whether a siteName is resolved', () => {
      const records = [
        buildExportedRecord({
          OSR_ID: '001',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          OSR_ID: '096',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-03-01',
          OSR_ID: '200',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 7
        })
      ]
      const orsDetailsMap = new Map([
        ['001', { siteName: 'EuroPlast GmbH', country: 'Germany' }],
        ['096', { siteName: null, country: null }]
      ])

      const result = aggregateReportDetail(records, {
        ...exporterArgs,
        orsDetailsMap
      })

      expect(result.exportActivity.overseasSites).toStrictEqual([
        {
          orsId: '001',
          siteName: 'EuroPlast GmbH',
          country: 'Germany',
          tonnageExported: 5
        }
      ])
      expect(result.exportActivity.unapprovedOverseasSites).toStrictEqual([
        { orsId: '096', tonnageExported: 3 },
        { orsId: '200', tonnageExported: 7 }
      ])
    })

    it('sums tonnage for duplicate unapproved ORS IDs', () => {
      const records = [
        buildExportedRecord({
          OSR_ID: '500',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 4
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          OSR_ID: '500',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 2.5
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-03-05',
          OSR_ID: '500',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 1.25
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.unapprovedOverseasSites).toStrictEqual([
        { orsId: '500', tonnageExported: 7.75 }
      ])
    })

    it('has overseasSites and unapprovedOverseasSites tonnages that together equal totalTonnageExported', () => {
      const records = [
        buildExportedRecord({
          OSR_ID: '001',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 1.01
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-01',
          OSR_ID: '002',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 2.02
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          OSR_ID: '998',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3.03
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-03-01',
          OSR_ID: '999',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 4.04
        })
      ]
      const orsDetailsMap = new Map([
        ['001', { siteName: 'EuroPlast GmbH', country: 'Germany' }],
        ['002', { siteName: 'RecyclePlast SA', country: 'France' }]
      ])

      const result = aggregateReportDetail(records, {
        ...exporterArgs,
        orsDetailsMap
      })

      const approvedTotal = result.exportActivity.overseasSites.reduce(
        (sum, s) => sum + s.tonnageExported,
        0
      )
      const unapprovedTotal =
        result.exportActivity.unapprovedOverseasSites.reduce(
          (sum, s) => sum + s.tonnageExported,
          0
        )

      expect(approvedTotal + unapprovedTotal).toBeCloseTo(
        result.exportActivity.totalTonnageExported,
        2
      )
      expect(result.exportActivity.overseasSites).toHaveLength(2)
      expect(result.exportActivity.unapprovedOverseasSites).toHaveLength(2)
    })

    it('populates siteName and country from orsDetailsMap', () => {
      const records = [
        buildExportedRecord({
          OSR_ID: '001',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          OSR_ID: '096',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
        })
      ]
      const orsDetailsMap = new Map([
        ['001', { siteName: 'EuroPlast GmbH', country: 'Germany' }],
        ['096', { siteName: 'RecyclePlast SA', country: 'France' }]
      ])

      const result = aggregateReportDetail(records, {
        ...exporterArgs,
        orsDetailsMap
      })

      expect(result.exportActivity.overseasSites).toStrictEqual([
        {
          orsId: '001',
          siteName: 'EuroPlast GmbH',
          country: 'Germany',
          tonnageExported: 5
        },
        {
          orsId: '096',
          siteName: 'RecyclePlast SA',
          country: 'France',
          tonnageExported: 3
        }
      ])
    })

    it('resolves siteName and country when OSR_ID is a number', () => {
      const records = [
        buildExportedRecord({
          OSR_ID: 124,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          OSR_ID: 99,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
        })
      ]
      const orsDetailsMap = new Map([
        ['124', { siteName: 'EuroPlast GmbH', country: 'Germany' }],
        ['099', { siteName: 'RecyclePlast SA', country: 'France' }]
      ])

      const result = aggregateReportDetail(records, {
        ...exporterArgs,
        orsDetailsMap
      })

      expect(result.exportActivity.overseasSites).toStrictEqual([
        {
          orsId: '124',
          siteName: 'EuroPlast GmbH',
          country: 'Germany',
          tonnageExported: 5
        },
        {
          orsId: '099',
          siteName: 'RecyclePlast SA',
          country: 'France',
          tonnageExported: 3
        }
      ])
    })

    it('deduplicates overseas sites by OSR_ID', () => {
      const records = [
        buildExportedRecord({
          OSR_NAME: 'EuroPlast Recycling GmbH',
          OSR_ID: '001'
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          OSR_NAME: 'EuroPlast Recycling GmbH',
          OSR_ID: '001'
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-03-05',
          OSR_NAME: 'RecyclePlast SA',
          OSR_ID: '096'
        })
      ]
      const orsDetailsMap = new Map([
        ['001', { siteName: 'EuroPlast Recycling GmbH', country: 'Germany' }],
        ['096', { siteName: 'RecyclePlast SA', country: 'France' }]
      ])

      const result = aggregateReportDetail(records, {
        ...exporterArgs,
        orsDetailsMap
      })

      expect(result.exportActivity.overseasSites).toHaveLength(2)
      expect(result.exportActivity.unapprovedOverseasSites).toHaveLength(0)
    })

    it('returns empty wasteExported when no exported records match', () => {
      const result = aggregateReportDetail([], exporterArgs)

      expect(result.exportActivity.totalTonnageExported).toBe(0)
      expect(result.exportActivity.overseasSites).toStrictEqual([])
      expect(result.exportActivity.unapprovedOverseasSites).toStrictEqual([])
      expect(result.exportActivity.tonnageRefusedAtDestination).toBe(0)
      expect(result.exportActivity.tonnageStoppedDuringExport).toBe(0)
      expect(result.exportActivity.totalTonnageRefusedOrStopped).toBe(0)
      expect(result.exportActivity.tonnageRepatriated).toBe(0)
    })

    it('sums tonnage refused at recipient destination', () => {
      const records = [
        buildExportedRecord({
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5,
          WAS_THE_WASTE_REFUSED: 'Yes'
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3,
          WAS_THE_WASTE_REFUSED: 'No'
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.tonnageRefusedAtDestination).toBe(5)
      expect(result.exportActivity.tonnageStoppedDuringExport).toBe(0)
      expect(result.exportActivity.totalTonnageRefusedOrStopped).toBe(5)
    })

    it('sums tonnage stopped during export', () => {
      const records = [
        buildExportedRecord({
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 4,
          WAS_THE_WASTE_STOPPED: 'Yes'
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-02-10',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 6,
          WAS_THE_WASTE_STOPPED: 'No'
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.tonnageStoppedDuringExport).toBe(4)
      expect(result.exportActivity.tonnageRefusedAtDestination).toBe(0)
      expect(result.exportActivity.totalTonnageRefusedOrStopped).toBe(4)
    })

    it('counts tonnage in both refused and stopped when both are Yes, but only once in total', () => {
      const records = [
        buildExportedRecord({
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 7,
          WAS_THE_WASTE_REFUSED: 'Yes',
          WAS_THE_WASTE_STOPPED: 'Yes'
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.tonnageRefusedAtDestination).toBe(7)
      expect(result.exportActivity.tonnageStoppedDuringExport).toBe(7)
      expect(result.exportActivity.totalTonnageRefusedOrStopped).toBe(7)
    })

    it('sums tonnage repatriated by DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED in period', () => {
      const records = [
        buildExportedRecord({
          DATE_OF_EXPORT: '2025-10-01',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-01-10',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 8
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-01-15',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-02-05',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.tonnageRepatriated).toBe(11)
    })

    it('excludes tonnage repatriated when DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED is outside period', () => {
      const records = [
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-01-15',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-04-01',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 10
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.tonnageRepatriated).toBe(0)
    })

    it('returns zero for refused, stopped and repatriated when flags are absent', () => {
      const records = [
        buildExportedRecord({
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.tonnageRefusedAtDestination).toBe(0)
      expect(result.exportActivity.tonnageStoppedDuringExport).toBe(0)
      expect(result.exportActivity.totalTonnageRefusedOrStopped).toBe(0)
      expect(result.exportActivity.tonnageRepatriated).toBe(0)
    })

    it('excludes exported records outside the period', () => {
      const records = [
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-01-15',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5
        }),
        buildExportedRecord({
          DATE_OF_EXPORT: '2026-04-01',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 99
        })
      ]

      const result = aggregateReportDetail(records, exporterArgs)

      expect(result.exportActivity.totalTonnageExported).toBe(5)
    })

    it('does not include wasteExported for reprocessor categories', () => {
      const result = aggregateReportDetail([], defaultArgs)

      expect(result.exportActivity).toBeUndefined()
    })
  })

  describe('accredited exporter', () => {
    const accreditedExporterArgs = {
      operatorCategory: OPERATOR_CATEGORY.EXPORTER,
      cadence: 'monthly',
      year: 2026,
      period: 2
    }

    const buildAccreditedExportedRecord = (overrides = {}) => ({
      type: WASTE_RECORD_TYPE.EXPORTED,
      data: {
        DATE_RECEIVED_FOR_EXPORT: '2026-02-05',
        DATE_OF_EXPORT: '2026-02-20',
        TONNAGE_RECEIVED_FOR_EXPORT: 50,
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 48,
        OSR_ID: '001',
        ...overrides
      },
      versions: [
        {
          createdAt: '2026-02-10T09:00:00.000Z',
          summaryLog: { id: 'sl-1' }
        }
      ]
    })

    it('aggregates waste received from exported records using DATE_RECEIVED_FOR_EXPORT', () => {
      const records = [
        buildAccreditedExportedRecord({
          DATE_RECEIVED_FOR_EXPORT: '2026-02-05',
          TONNAGE_RECEIVED_FOR_EXPORT: 50.25
        }),
        buildAccreditedExportedRecord({
          DATE_RECEIVED_FOR_EXPORT: '2026-02-10',
          TONNAGE_RECEIVED_FOR_EXPORT: 30
        })
      ]

      const result = aggregateReportDetail(records, accreditedExporterArgs)

      expect(result.recyclingActivity.totalTonnageReceived).toBe(80.25)
    })

    it('returns suppliers even when all fields are missing for wasteReceived', () => {
      const records = [buildAccreditedExportedRecord()]

      const result = aggregateReportDetail(records, accreditedExporterArgs)

      expect(result.recyclingActivity.suppliers).toStrictEqual([
        {
          facilityType: null,
          supplierAddress: null,
          supplierEmail: null,
          supplierName: null,
          supplierPhone: null,
          tonnageReceived: 50
        }
      ])
    })

    it('aggregates waste exported using DATE_OF_EXPORT', () => {
      const records = [
        buildAccreditedExportedRecord({
          DATE_OF_EXPORT: '2026-02-15',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5
        }),
        buildAccreditedExportedRecord({
          DATE_OF_EXPORT: '2026-02-20',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 6.5
        })
      ]

      const result = aggregateReportDetail(records, accreditedExporterArgs)

      expect(result.exportActivity.totalTonnageExported).toBe(11.5)
    })

    it('filters wasteReceived and wasteExported by different date fields', () => {
      const records = [
        buildAccreditedExportedRecord({
          DATE_RECEIVED_FOR_EXPORT: '2026-01-15',
          DATE_OF_EXPORT: '2026-02-10',
          TONNAGE_RECEIVED_FOR_EXPORT: 42,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 40
        })
      ]

      const january = aggregateReportDetail(records, {
        ...accreditedExporterArgs,
        period: 1
      })

      expect(january.recyclingActivity.totalTonnageReceived).toBe(42)
      expect(january.exportActivity.totalTonnageExported).toBe(0)

      const february = aggregateReportDetail(records, accreditedExporterArgs)

      expect(february.recyclingActivity.totalTonnageReceived).toBe(0)
      expect(february.exportActivity.totalTonnageExported).toBe(40)
    })

    it('routes unresolved ORS IDs to unapprovedOverseasSites for accredited exporter', () => {
      const records = [
        buildAccreditedExportedRecord({ OSR_ID: '001' }),
        buildAccreditedExportedRecord({
          DATE_OF_EXPORT: '2026-02-25',
          OSR_ID: '096'
        })
      ]

      const result = aggregateReportDetail(records, accreditedExporterArgs)

      expect(result.exportActivity.overseasSites).toStrictEqual([])
      expect(result.exportActivity.unapprovedOverseasSites).toStrictEqual([
        { orsId: '001', tonnageExported: 48 },
        { orsId: '096', tonnageExported: 48 }
      ])
    })

    it('populates siteName and country from orsDetailsMap for accredited exporter', () => {
      const records = [
        buildAccreditedExportedRecord({
          OSR_ID: '001',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 48
        })
      ]
      const orsDetailsMap = new Map([
        ['001', { siteName: 'EuroPlast GmbH', country: 'Germany' }]
      ])

      const result = aggregateReportDetail(records, {
        ...accreditedExporterArgs,
        orsDetailsMap
      })

      expect(result.exportActivity.overseasSites).toStrictEqual([
        {
          orsId: '001',
          siteName: 'EuroPlast GmbH',
          country: 'Germany',
          tonnageExported: 48
        }
      ])
    })

    describe('tonnageReceivedNotExported', () => {
      it('excludes records whose DATE_OF_EXPORT falls within the same period', () => {
        const records = [
          buildAccreditedExportedRecord({
            DATE_RECEIVED_FOR_EXPORT: '2026-02-05',
            DATE_OF_EXPORT: '2026-02-20',
            TONNAGE_RECEIVED_FOR_EXPORT: 50
          })
        ]

        const result = aggregateReportDetail(records, accreditedExporterArgs)

        expect(result.exportActivity.tonnageReceivedNotExported).toBe(0)
      })

      it('includes records whose DATE_OF_EXPORT is after the period', () => {
        const records = [
          buildAccreditedExportedRecord({
            DATE_RECEIVED_FOR_EXPORT: '2026-02-05',
            DATE_OF_EXPORT: '2026-03-10',
            TONNAGE_RECEIVED_FOR_EXPORT: 37.5
          })
        ]

        const result = aggregateReportDetail(records, accreditedExporterArgs)

        expect(result.exportActivity.tonnageReceivedNotExported).toBe(37.5)
      })

      it('includes records with no DATE_OF_EXPORT', () => {
        const records = [
          buildAccreditedExportedRecord({
            DATE_RECEIVED_FOR_EXPORT: '2026-02-05',
            DATE_OF_EXPORT: null,
            TONNAGE_RECEIVED_FOR_EXPORT: 25
          })
        ]

        const result = aggregateReportDetail(records, accreditedExporterArgs)

        expect(result.exportActivity.tonnageReceivedNotExported).toBe(25)
      })

      it('sums only records not exported within the period', () => {
        const records = [
          buildAccreditedExportedRecord({
            DATE_RECEIVED_FOR_EXPORT: '2026-02-05',
            DATE_OF_EXPORT: '2026-02-20',
            TONNAGE_RECEIVED_FOR_EXPORT: 30
          }),
          buildAccreditedExportedRecord({
            DATE_RECEIVED_FOR_EXPORT: '2026-02-10',
            DATE_OF_EXPORT: '2026-03-05',
            TONNAGE_RECEIVED_FOR_EXPORT: 20
          }),
          buildAccreditedExportedRecord({
            DATE_RECEIVED_FOR_EXPORT: '2026-02-15',
            DATE_OF_EXPORT: null,
            TONNAGE_RECEIVED_FOR_EXPORT: 10
          })
        ]

        const result = aggregateReportDetail(records, accreditedExporterArgs)

        expect(result.exportActivity.tonnageReceivedNotExported).toBe(30)
      })
    })
  })

  describe('unvalidated data (registered-only validation is placeholder)', () => {
    it('treats non-numeric tonnage as zero', () => {
      const records = [
        buildReceivedRecord({
          TONNAGE_RECEIVED_FOR_RECYCLING: 'not a number'
        }),
        buildReceivedRecord({
          MONTH_RECEIVED_FOR_REPROCESSING: '2026-02',
          TONNAGE_RECEIVED_FOR_RECYCLING: 50
        })
      ]

      const result = aggregateReportDetail(records, defaultArgs)

      expect(result.recyclingActivity.totalTonnageReceived).toBe(50)
    })

    it('returns empty section when operator category has no date fields for a record type', () => {
      const records = [buildReceivedRecord()]

      const result = aggregateReportDetail(records, {
        ...defaultArgs,
        operatorCategory: OPERATOR_CATEGORY.EXPORTER
      })

      expect(result.recyclingActivity.totalTonnageReceived).toBe(0)
      expect(result.recyclingActivity.suppliers).toEqual([])
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

      expect(result.recyclingActivity.totalTonnageReceived).toBe(0)
    })
  })

  describe('validation', () => {
    it('throws TypeError for unknown cadence', () => {
      expect(() =>
        aggregateReportDetail([], { ...defaultArgs, cadence: 'biweekly' })
      ).toThrow(TypeError)
    })
  })
})
