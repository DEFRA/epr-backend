import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

import { tableSchemasOf } from './index.js'
import { BEFORE_SUMMARY_LOG_YEAR_ERROR } from './shared/field-schemas.js'

const context = { summaryLogYear: toYear(2027), uploadDate: '2027-01-10' }

/**
 * @param {import('joi').ObjectSchema} validationSchema
 */
const columnsRejectingAnOpenEarlierYear = (validationSchema) =>
  Object.keys(validationSchema.describe().keys ?? {}).filter((field) =>
    validationSchema
      .validate({ [field]: '2026-12-01' }, { context, abortEarly: false })
      .error?.details.some(
        ({ path, type }) =>
          path[0] === field && type === BEFORE_SUMMARY_LOG_YEAR_ERROR
      )
  )

/** @param {import('#domain/summary-logs/meta-fields.js').ProcessingType} processingType */
const rejectingColumnsOf = (processingType) =>
  Object.fromEntries(
    Object.entries(tableSchemasOf(toYear(2027), processingType)).map(
      ([table, { validationSchema }]) => [
        table,
        columnsRejectingAnOpenEarlierYear(validationSchema)
      ]
    )
  )

describe('columns rejecting a date in an open earlier year', () => {
  it('covers every accredited exporter date column', () => {
    expect(rejectingColumnsOf(PROCESSING_TYPES.EXPORTER)).toStrictEqual({
      RECEIVED_LOADS_FOR_EXPORT: [
        'DATE_RECEIVED_FOR_EXPORT',
        'DATE_OF_EXPORT',
        'DATE_RECEIVED_BY_OSR',
        'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
      ],
      SENT_ON_LOADS: ['DATE_LOAD_LEFT_SITE']
    })
  })

  it('covers every registered-only exporter date column', () => {
    expect(
      rejectingColumnsOf(PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY)
    ).toStrictEqual({
      RECEIVED_LOADS_FOR_EXPORT: ['MONTH_RECEIVED_FOR_EXPORT'],
      LOADS_EXPORTED: [
        'DATE_OF_EXPORT',
        'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
      ],
      SENT_ON_LOADS: ['DATE_LOAD_LEFT_SITE']
    })
  })

  it.each([
    PROCESSING_TYPES.REPROCESSOR_INPUT,
    PROCESSING_TYPES.REPROCESSOR_OUTPUT,
    PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
  ])('covers no %s column yet', (processingType) => {
    expect(
      Object.values(rejectingColumnsOf(processingType)).flat()
    ).toStrictEqual([])
  })
})
