import { describe, expect, it } from 'vitest'

import { aggregateReportDetail } from '#root/reports/domain/aggregation/aggregate-report-detail.js'
import { aggregateWasteExported } from '#root/reports/domain/aggregation/aggregate-waste-exported.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import wasteRecordsAccredited from './test-data/exporter-accredited.json'
import wasteRecordsRegisteredOnly from './test-data/exporter-reg-only.json'

const buildExportedRecord = (tonnage) => ({
  type: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnage,
    WAS_THE_WASTE_REFUSED: 'No',
    WAS_THE_WASTE_STOPPED: 'No'
  }
})

describe('#aggregateReportDetail — EXPORTER accredited monthly January 2026', () => {
  it('aggregates in-period records into the full report detail', () => {
    const result = aggregateReportDetail(wasteRecordsAccredited, {
      operatorCategory: 'EXPORTER',
      cadence: 'monthly',
      year: 2026,
      period: 1
    })

    expect(result).toEqual({
      operatorCategory: 'EXPORTER',
      cadence: 'monthly',
      year: 2026,
      period: 1,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      source: {
        lastUploadedAt: '2026-04-02T11:31:06.440Z',
        summaryLogId: 'dccebb57-da7a-4d50-9f17-2984f6c9fb22'
      },
      recyclingActivity: {
        suppliers: [
          {
            supplierName: 'Test3',
            facilityType: null,
            supplierAddress: null,
            supplierPhone: null,
            supplierEmail: null,
            tonnageReceived: 65.26
          },
          {
            supplierName: 'Test2',
            facilityType: null,
            supplierAddress: null,
            supplierPhone: null,
            supplierEmail: null,
            tonnageReceived: 37.44
          },
          {
            supplierName: 'Test1',
            facilityType: null,
            supplierAddress: null,
            supplierPhone: null,
            supplierEmail: null,
            tonnageReceived: 44
          }
        ],
        totalTonnageReceived: 146.7,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      },
      exportActivity: {
        overseasSites: [
          { orsId: 512, siteName: null, country: null, tonnageExported: 23.41 },
          { orsId: 124, siteName: null, country: null, tonnageExported: 65.62 }
        ],
        totalTonnageExported: 89.03,
        tonnageReceivedNotExported: 57.67,
        tonnageRefusedAtDestination: 50,
        tonnageStoppedDuringExport: 50,
        totalTonnageRefusedOrStopped: 50,
        tonnageRepatriated: 0
      },
      wasteSent: {
        tonnageSentToReprocessor: 0,
        tonnageSentToExporter: 37,
        tonnageSentToAnotherSite: 0,
        finalDestinations: [
          {
            recipientName: 'Cleaners Limited',
            facilityType: 'Exporter',
            address: '112 Test Road, TE11 2PX',
            tonnageSentOn: 37
          }
        ]
      }
    })
  })
})

describe('#aggregateReportDetail — EXPORTER accredited monthly February 2026', () => {
  it('aggregates in-period records including repatriated tonnage from January export', () => {
    const result = aggregateReportDetail(wasteRecordsAccredited, {
      operatorCategory: 'EXPORTER',
      cadence: 'monthly',
      year: 2026,
      period: 2
    })

    expect(result).toEqual({
      operatorCategory: 'EXPORTER',
      cadence: 'monthly',
      year: 2026,
      period: 2,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      source: {
        lastUploadedAt: '2026-04-02T11:31:06.440Z',
        summaryLogId: 'dccebb57-da7a-4d50-9f17-2984f6c9fb22'
      },
      recyclingActivity: {
        suppliers: [],
        totalTonnageReceived: 0,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      },
      exportActivity: {
        overseasSites: [],
        totalTonnageExported: 0,
        tonnageReceivedNotExported: 0,
        tonnageRefusedAtDestination: 0,
        tonnageStoppedDuringExport: 0,
        totalTonnageRefusedOrStopped: 0,
        tonnageRepatriated: 50
      },
      wasteSent: {
        tonnageSentToReprocessor: 0,
        tonnageSentToExporter: 0,
        tonnageSentToAnotherSite: 0,
        finalDestinations: []
      }
    })
  })
})

describe('#aggregateReportDetail — EXPORTER_REGISTERED_ONLY quarterly Q1 2026', () => {
  it('aggregates in-period records into the full report detail', () => {
    const result = aggregateReportDetail(wasteRecordsRegisteredOnly, {
      operatorCategory: 'EXPORTER_REGISTERED_ONLY',
      cadence: 'quarterly',
      year: 2026,
      period: 1
    })

    expect(result).toEqual({
      operatorCategory: 'EXPORTER_REGISTERED_ONLY',
      cadence: 'quarterly',
      year: 2026,
      period: 1,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      source: {
        lastUploadedAt: '2026-04-02T12:11:42.889Z',
        summaryLogId: '98c1e68c-05c6-4b1d-bdca-59727d302c1b'
      },
      recyclingActivity: {
        suppliers: [
          {
            supplierName: 'Daniel Group',
            facilityType: 'Sorting',
            supplierAddress: '572 Metz Mount, UQ9 2FT',
            supplierPhone: '0800 668 4671',
            supplierEmail: 'Alayna_Mann@gmail.com',
            tonnageReceived: 13.39
          },
          {
            supplierName: 'Ryan Inc',
            facilityType: 'Sorting',
            supplierAddress: '9 Howe Court, ND52 8TP',
            supplierPhone: '0800 023911',
            supplierEmail: 'Mandy90@hotmail.com',
            tonnageReceived: 21.29
          },
          {
            supplierName: "Padberg, Howell and O'Kon",
            facilityType: 'Baling',
            supplierAddress: '756 Dietrich Paddock, GC1 6UO',
            supplierPhone: '014007 26249',
            supplierEmail: 'Raymond.Maggio@hotmail.com',
            tonnageReceived: 19.71
          },
          {
            supplierName: 'Bauch LLC',
            facilityType: 'Baling',
            supplierAddress: '9 Highfield Road, CY2 3DC',
            supplierPhone: '013063 13700',
            supplierEmail: 'Wendell.Bergstrom@hotmail.com',
            tonnageReceived: 29.69
          }
        ],
        totalTonnageReceived: 84.09,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      },
      exportActivity: {
        overseasSites: [
          { orsId: 565, siteName: null, country: null, tonnageExported: 2.99 },
          { orsId: 297, siteName: null, country: null, tonnageExported: 3.02 },
          { orsId: 893, siteName: null, country: null, tonnageExported: 1.26 },
          { orsId: 143, siteName: null, country: null, tonnageExported: 3.07 }
        ],
        totalTonnageExported: 10.33,
        tonnageReceivedNotExported: 73.76,
        tonnageRefusedAtDestination: 7.34,
        tonnageStoppedDuringExport: 6.01,
        totalTonnageRefusedOrStopped: 10.33,
        tonnageRepatriated: 10.33
      },
      wasteSent: {
        tonnageSentToReprocessor: 0,
        tonnageSentToExporter: 49.03,
        tonnageSentToAnotherSite: 0,
        finalDestinations: [
          {
            recipientName: 'Boyer - Huels',
            facilityType: 'Exporter',
            address: '419 Jones Row, GJ1 6MK',
            tonnageSentOn: 14.25
          },
          {
            recipientName: 'Robel - Dicki',
            facilityType: 'Exporter',
            address: '45 New Street, LR54 0IG',
            tonnageSentOn: 15.37
          },
          {
            recipientName: 'Torphy, Becker and Schmeler',
            facilityType: 'Exporter',
            address: '37 Schmidt Lane, DL6 2CB',
            tonnageSentOn: 8.44
          },
          {
            recipientName: 'Schmitt - Nolan',
            facilityType: 'Exporter',
            address: '8 Stacy Approach, JS5 0GH',
            tonnageSentOn: 10.96
          }
        ]
      }
    })
  })
})

describe('#aggregateWasteExported — tonnageReceivedNotExported', () => {
  it('returns zero when exported tonnage exceeds received tonnage', () => {
    const result = aggregateWasteExported([buildExportedRecord(80)], [], 50)

    expect(result.tonnageReceivedNotExported).toBe(0)
  })

  it('returns zero when exported tonnage equals received tonnage', () => {
    const result = aggregateWasteExported([buildExportedRecord(50)], [], 50)

    expect(result.tonnageReceivedNotExported).toBe(0)
  })

  it('returns the difference when received tonnage exceeds exported tonnage', () => {
    const result = aggregateWasteExported([buildExportedRecord(30)], [], 50)

    expect(result.tonnageReceivedNotExported).toBe(20)
  })
})
