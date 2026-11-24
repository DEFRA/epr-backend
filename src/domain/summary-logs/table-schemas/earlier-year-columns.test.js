import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

import { tableSchemasOf } from './index.js'
import {
  AFTER_SUMMARY_LOG_YEAR_ERROR,
  BEFORE_SUMMARY_LOG_YEAR_ERROR
} from './shared/field-schemas.js'

/** @import { ProcessingType } from '#domain/summary-logs/meta-fields.js' */

const context = {
  summaryLogYear: toYear(2027),
  createdAt: new Date('2027-01-10T09:00:00.000Z'),
  registeredOnly: false
}

/**
 * @param {import('joi').ObjectSchema} validationSchema
 * @param {string} date
 * @param {string} errorType
 */
const columnsRejecting = (validationSchema, date, errorType) =>
  Object.keys(validationSchema.describe().keys ?? {}).filter((field) =>
    validationSchema
      .validate({ [field]: date }, { context, abortEarly: false })
      .error?.details.some(
        ({ path, type }) => path[0] === field && type === errorType
      )
  )

/** @param {ProcessingType} processingType */
const dateColumnsOf = (processingType) =>
  Object.entries(tableSchemasOf(toYear(2027), processingType)).map(
    ([table, { validationSchema }]) => ({
      table,
      dateColumns: columnsRejecting(
        validationSchema,
        '2028-01-01',
        AFTER_SUMMARY_LOG_YEAR_ERROR
      ),
      rejectingEarlierYear: columnsRejecting(
        validationSchema,
        '2026-12-01',
        BEFORE_SUMMARY_LOG_YEAR_ERROR
      )
    })
  )

describe('date columns rejecting a date in an open earlier year', () => {
  it.each([
    PROCESSING_TYPES.EXPORTER,
    PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
  ])('are every %s date column', (processingType) => {
    const tables = dateColumnsOf(processingType)

    expect(tables.flatMap(({ dateColumns }) => dateColumns)).not.toEqual([])
    for (const { table, dateColumns, rejectingEarlierYear } of tables) {
      expect({ table, columns: rejectingEarlierYear }).toStrictEqual({
        table,
        columns: dateColumns
      })
    }
  })

  it.each([
    PROCESSING_TYPES.REPROCESSOR_INPUT,
    PROCESSING_TYPES.REPROCESSOR_OUTPUT,
    PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
  ])('are no %s date column yet', (processingType) => {
    const tables = dateColumnsOf(processingType)

    expect(tables.flatMap(({ dateColumns }) => dateColumns)).not.toEqual([])
    expect(
      tables.flatMap(({ rejectingEarlierYear }) => rejectingEarlierYear)
    ).toStrictEqual([])
  })
})
