import { describe, it, expect } from 'vitest'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  addMeasures,
  averagePricePerTonne,
  measuresOf,
  noMeasures,
  withPublishedFigures
} from './reprocessor-exporter-figures.js'

const submittedReport = (overrides) => ({
  id: 'report-1',
  status: 'submitted',
  submissionNumber: 1,
  submittedAt: '2026-02-03T10:00:00.000Z',
  submittedBy: null,
  resubmissionRequired: null,
  ...overrides
})

describe('measuresOf', () => {
  it('reads the reprocessor measures a report carries, with revised tonnage as issued less self-issued', () => {
    const report = submittedReport({
      recyclingActivity: {
        totalTonnageReceived: 100.5,
        tonnageRecycled: 80.25,
        tonnageNotRecycled: 20.25
      },
      wasteSent: {
        tonnageSentToReprocessor: 1,
        tonnageSentToExporter: 2,
        tonnageSentToAnotherSite: 3
      },
      prn: {
        issuedTonnage: 80,
        freeTonnage: 5,
        totalRevenue: 40000,
        averagePricePerTonne: 533.33
      }
    })

    expect(measuresOf(report, WASTE_PROCESSING_TYPE.REPROCESSOR)).toEqual({
      tonnageReceived: 100.5,
      tonnageRecycled: 80.25,
      tonnageReceivedButNotRecycled: 20.25,
      tonnageSentOnToReprocessor: 1,
      tonnageSentOnToExporter: 2,
      tonnageSentOnToOtherFacilities: 3,
      revisedTonnageIssued: 75,
      totalRevenue: 40000
    })
  })

  it('reads the exporter measures a report carries', () => {
    const report = submittedReport({
      recyclingActivity: {
        totalTonnageReceived: 200,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      },
      exportActivity: {
        totalTonnageExported: 150,
        tonnageReceivedNotExported: 50,
        tonnageStoppedDuringExport: 4,
        tonnageRefusedAtDestination: 5,
        tonnageRepatriated: 6
      },
      wasteSent: {
        tonnageSentToReprocessor: 0,
        tonnageSentToExporter: 7,
        tonnageSentToAnotherSite: 0
      },
      prn: {
        issuedTonnage: 150,
        freeTonnage: 0,
        totalRevenue: 30000,
        averagePricePerTonne: 200
      }
    })

    expect(measuresOf(report, WASTE_PROCESSING_TYPE.EXPORTER)).toEqual({
      tonnageReceived: 200,
      tonnageExported: 150,
      tonnageReceivedButNotExported: 50,
      tonnageStopped: 4,
      tonnageRefused: 5,
      tonnageRepatriated: 6,
      tonnageSentOnToReprocessor: 0,
      tonnageSentOnToExporter: 7,
      tonnageSentOnToOtherFacilities: 0,
      revisedTonnageIssued: 150,
      totalRevenue: 30000
    })
  })

  it('reads zero for every measure a report has not filled in', () => {
    expect(
      measuresOf(submittedReport({}), WASTE_PROCESSING_TYPE.EXPORTER)
    ).toEqual(noMeasures(WASTE_PROCESSING_TYPE.EXPORTER))
    expect(
      measuresOf(
        submittedReport({
          recyclingActivity: {
            totalTonnageReceived: 10,
            tonnageRecycled: null,
            tonnageNotRecycled: null
          },
          prn: { issuedTonnage: 10 }
        }),
        WASTE_PROCESSING_TYPE.REPROCESSOR
      )
    ).toEqual({
      ...noMeasures(WASTE_PROCESSING_TYPE.REPROCESSOR),
      tonnageReceived: 10,
      revisedTonnageIssued: 10
    })
  })
})

describe('addMeasures', () => {
  it('sums each measure without floating-point drift', () => {
    expect(
      addMeasures(
        {
          ...noMeasures(WASTE_PROCESSING_TYPE.REPROCESSOR),
          tonnageReceived: 0.1
        },
        {
          ...noMeasures(WASTE_PROCESSING_TYPE.REPROCESSOR),
          tonnageReceived: 0.2
        }
      )
    ).toEqual({
      ...noMeasures(WASTE_PROCESSING_TYPE.REPROCESSOR),
      tonnageReceived: 0.3
    })
  })
})

describe('averagePricePerTonne', () => {
  it('divides total revenue by total revised tonnage', () => {
    expect(averagePricePerTonne(40000, 75)).toBe(533.33)
  })

  it('answers zero when nothing was issued', () => {
    expect(averagePricePerTonne(0, 0)).toBe(0)
    expect(averagePricePerTonne(100, 0)).toBe(0)
  })
})

describe('withPublishedFigures', () => {
  it('adds the sent-on total and the average price to the summed measures', () => {
    expect(
      withPublishedFigures({
        ...noMeasures(WASTE_PROCESSING_TYPE.REPROCESSOR),
        tonnageSentOnToReprocessor: 1.1,
        tonnageSentOnToExporter: 2.2,
        tonnageSentOnToOtherFacilities: 3.3,
        revisedTonnageIssued: 75,
        totalRevenue: 40000
      })
    ).toEqual({
      ...noMeasures(WASTE_PROCESSING_TYPE.REPROCESSOR),
      tonnageSentOnToReprocessor: 1.1,
      tonnageSentOnToExporter: 2.2,
      tonnageSentOnToOtherFacilities: 3.3,
      tonnageSentOnTotal: 6.6,
      revisedTonnageIssued: 75,
      totalRevenue: 40000,
      averagePricePerTonne: 533.33
    })
  })
})
