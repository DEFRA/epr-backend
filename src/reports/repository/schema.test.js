import { describe, expect, it } from 'vitest'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { aggregateWasteExported } from '#reports/domain/aggregation/aggregate-waste-exported.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { OPERATOR_CATEGORY } from '#reports/domain/operator-category.js'
import { periodBounds } from '#reports/domain/reporting-period.js'
import { exportActivitySchema } from './schema.js'

const reportingPeriod = periodBounds(CADENCE.monthly, 2026, 1)

const exportedRow = (data = {}) => ({
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    OSR_ID: 7,
    DATE_OF_EXPORT: '2026-01-15',
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 10.5,
    TONNAGE_RECEIVED_FOR_EXPORT: 12,
    WAS_THE_WASTE_REFUSED: 'No',
    WAS_THE_WASTE_STOPPED: 'No',
    ...data
  }
})

const resolvedSite = {
  siteName: 'Site A',
  country: 'DE',
  validFrom: new Date('2025-01-01')
}

const aggregate = (operatorCategory, records, orsDetailsMap) =>
  aggregateWasteExported({
    wasteExportedRecords: records,
    repatriatedRecords: records,
    wasteReceivedRecords: records,
    reportingPeriod,
    orsDetailsMap,
    operatorCategory
  })

describe('exportActivitySchema', () => {
  const cases = [
    {
      scenario: 'accredited exporter with a resolved site',
      operatorCategory: OPERATOR_CATEGORY.EXPORTER,
      records: [exportedRow()],
      orsDetailsMap: new Map([['007', resolvedSite]])
    },
    {
      scenario: 'registered-only exporter, whose received-not-exported is null',
      operatorCategory: OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY,
      records: [exportedRow()],
      orsDetailsMap: new Map([['007', resolvedSite]])
    },
    {
      scenario: 'unresolved site, populating unapprovedOverseasSites',
      operatorCategory: OPERATOR_CATEGORY.EXPORTER,
      records: [exportedRow()],
      orsDetailsMap: new Map()
    },
    {
      scenario: 'refused and stopped loads',
      operatorCategory: OPERATOR_CATEGORY.EXPORTER,
      records: [
        exportedRow({ WAS_THE_WASTE_REFUSED: 'Yes' }),
        exportedRow({ WAS_THE_WASTE_STOPPED: 'Yes' })
      ],
      orsDetailsMap: new Map([['007', resolvedSite]])
    },
    {
      scenario: 'no records at all',
      operatorCategory: OPERATOR_CATEGORY.EXPORTER,
      records: [],
      orsDetailsMap: new Map()
    }
  ]

  it.each(cases)(
    'accepts what the aggregation produces for $scenario',
    ({ operatorCategory, records, orsDetailsMap }) => {
      const exportActivity = aggregate(operatorCategory, records, orsDetailsMap)

      const { error } = exportActivitySchema.validate(exportActivity)

      expect(error).toBeUndefined()
    }
  )

  it('rejects a field the aggregation does not produce', () => {
    const exportActivity = aggregate(
      OPERATOR_CATEGORY.EXPORTER,
      [exportedRow()],
      new Map([['007', resolvedSite]])
    )

    const { error } = exportActivitySchema.validate({
      ...exportActivity,
      tonnageInvented: 1
    })

    expect(error?.message).toContain('tonnageInvented')
  })

  it('rejects an aggregation output missing a field the schema requires', () => {
    const { totalTonnageRefusedOrStopped: _dropped, ...withoutField } =
      aggregate(
        OPERATOR_CATEGORY.EXPORTER,
        [exportedRow()],
        new Map([['007', resolvedSite]])
      )

    const { error } = exportActivitySchema.validate(withoutField)

    expect(error?.message).toContain('totalTonnageRefusedOrStopped')
  })
})
