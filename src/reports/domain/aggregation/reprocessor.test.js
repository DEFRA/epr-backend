import { aggregateReportDetail } from '#root/reports/domain/aggregation/aggregate-report-detail.js'
import wasteRecordsRegisteredOnly from './test-data/reprocessor-registered-only.json'
import wasteRecordsAccredited from './test-data/reprocessor-on-input-accredited.json'

describe('#aggregateReportDetail — REPROCESSOR_REGISTERED_ONLY quarterly Q1 2026', () => {
  it('aggregates in-period records into the full report detail', () => {
    const result = aggregateReportDetail(wasteRecordsRegisteredOnly, {
      operatorCategory: 'REPROCESSOR_REGISTERED_ONLY',
      cadence: 'quarterly',
      year: 2026,
      period: 1
    })

    expect(result).toEqual({
      operatorCategory: 'REPROCESSOR_REGISTERED_ONLY',
      cadence: 'quarterly',
      year: 2026,
      period: 1,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      recyclingActivity: {
        suppliers: [
          {
            supplierName: 'Reilly Group',
            facilityType: 'Baling',
            supplierAddress: '1 Kemmer Garth, UX3 9YW',
            supplierPhone: '056 3605 9169',
            supplierEmail: 'Violette.Stoltenberg@hotmail.com',
            tonnageReceived: 8.65
          },
          {
            supplierName: 'Bogisich, Hegmann and Miller',
            facilityType: 'Sorting',
            supplierAddress: '653 Klocko Bank, CH77 1ZO',
            supplierPhone: '0800 381 2820',
            supplierEmail: 'Hershel.Rolfson@hotmail.com',
            tonnageReceived: 17.05
          },
          {
            supplierName: 'Rippin and Sons',
            facilityType: 'Baling',
            supplierAddress: '8 Henry Street, KR4 8WX',
            supplierPhone: '0112 848 0025',
            supplierEmail: 'Solon_Schiller94@gmail.com',
            tonnageReceived: 12.69
          },
          {
            supplierName: "O'Hara - Larkin",
            facilityType: 'Baling',
            supplierAddress: '7 Westfield Road, FW35 6JC',
            supplierPhone: '0394 634 4015',
            supplierEmail: 'Dwayne.Schuppe74@hotmail.com',
            tonnageReceived: 14.44
          }
        ],
        totalTonnageReceived: 52.82,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      },
      wasteSent: {
        tonnageSentToReprocessor: 30.22,
        tonnageSentToExporter: 0,
        tonnageSentToAnotherSite: 0,
        finalDestinations: [
          {
            recipientName: 'Jacobs - Simonis',
            facilityType: 'Reprocessor',
            address: '26 Tyrone Avenue, TH51 2AD',
            tonnageSentOn: 9.22
          },
          {
            recipientName: 'Bosco Inc',
            facilityType: 'Reprocessor',
            address: '39 Ferry Road, IH26 2GS',
            tonnageSentOn: 5.41
          },
          {
            recipientName: 'Robel - Kuhic',
            facilityType: 'Reprocessor',
            address: '8 Stanton Wood, WV8 4WY',
            tonnageSentOn: 10.5
          },
          {
            recipientName: 'Heller Group',
            facilityType: 'Reprocessor',
            address: '573 Gutmann Park, NP1 9OT',
            tonnageSentOn: 5.09
          }
        ]
      },
      source: {
        lastUploadedAt: '2026-03-31T19:35:45.562Z',
        summaryLogId: '18bde18b-5200-4e86-9aad-738a16b05db8'
      }
    })
  })
})

describe('#aggregateReportDetail — REPROCESSOR accredited monthly January 2026', () => {
  it('aggregates in-period records into the full report detail', () => {
    const result = aggregateReportDetail(wasteRecordsAccredited, {
      operatorCategory: 'REPROCESSOR',
      cadence: 'monthly',
      year: 2026,
      period: 1
    })

    expect(result).toEqual({
      operatorCategory: 'REPROCESSOR',
      cadence: 'monthly',
      year: 2026,
      period: 1,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      source: {
        lastUploadedAt: '2026-03-31T19:37:45.709Z',
        summaryLogId: 'a8721bcb-8d55-44ea-9d5b-d0a4776e9aad'
      },
      recyclingActivity: {
        suppliers: [
          {
            supplierName: '3 Arrows Recycling Solutions Ltd',
            facilityType: 'Sorting',
            supplierAddress: 'Milton Hall, CB24 6WZ',
            supplierPhone: '07985100113',
            supplierEmail: 'webuy@boomerang.co.uk',
            tonnageReceived: 51.63
          },
          {
            supplierName: '3 Arrows Recycling Solutions Ltd',
            facilityType: 'Sorting',
            supplierAddress: 'Milton Hall, CB24 6WZ',
            supplierPhone: '07985100113',
            supplierEmail: 'Webuy@boomerang.co.uk',
            tonnageReceived: 339.99
          },
          {
            facilityType: 'Sorting',
            supplierAddress: 'Milton Hall, CB24 6WZ',
            supplierEmail: 'Webuy@boomerang.co.uk',
            supplierName: null,
            supplierPhone: '07985100113',
            tonnageReceived: 339.99
          },
          {
            supplierName: '3 Arrows Recycling Solutions Ltd',
            facilityType: 'Baling',
            supplierAddress: 'Hall, CB24 6WZ',
            supplierPhone: '07985100113',
            supplierEmail: 'Webuy@boomerang.co.uk',
            tonnageReceived: 13
          }
        ],
        totalTonnageReceived: 744.61,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      },
      wasteSent: {
        tonnageSentToReprocessor: 150,
        tonnageSentToExporter: 1000,
        tonnageSentToAnotherSite: 50,
        finalDestinations: [
          {
            recipientName: 'High Low Limited',
            facilityType: 'Reprocessor',
            address: '345 High Low Street, SO11 7ME',
            tonnageSentOn: 50
          },
          {
            recipientName: 'Board laboratories',
            facilityType: 'Other',
            address: null,
            tonnageSentOn: 50
          },
          {
            recipientName: 'HighLow Limited',
            facilityType: 'Exporter',
            address: '11 high street, G59NS',
            tonnageSentOn: 1000
          },
          {
            recipientName: 'HighLow Limited',
            facilityType: 'Reprocessor',
            address: '12 high street, G59NS',
            tonnageSentOn: 100
          }
        ]
      }
    })
  })
})
