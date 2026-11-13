import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

import { tableSchemasOf } from './index.js'

const tableOf = (year, processingType, tableName) =>
  tableSchemasOf(toYear(year), processingType)[tableName]

/** @type {[string, string, string[]][]} */
const NEW_COLUMNS = [
  [
    PROCESSING_TYPES.EXPORTER,
    'RECEIVED_LOADS_FOR_EXPORT',
    ['PREVIOUS_YEAR_ROW_ID', 'EXIT_PORT', 'DWT_EXPORT_ID', 'DWT_SUPPLY_ID']
  ],
  [
    PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
    'LOADS_EXPORTED',
    ['PREVIOUS_YEAR_ROW_ID', 'EXIT_PORT', 'DWT_EXPORT_ID']
  ],
  [
    PROCESSING_TYPES.REPROCESSOR_INPUT,
    'RECEIVED_LOADS_FOR_REPROCESSING',
    ['DWT_SUPPLY_ID']
  ],
  [
    PROCESSING_TYPES.REPROCESSOR_OUTPUT,
    'RECEIVED_LOADS_FOR_REPROCESSING',
    ['DWT_SUPPLY_ID']
  ],
  [
    PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
    'RECEIVED_LOADS_FOR_REPROCESSING',
    ['DWT_SUPPLY_ID']
  ]
]

describe('2027 additional columns', () => {
  it.each(NEW_COLUMNS)(
    'adds %s %s headers %j to the 2026 table',
    (processingType, tableName, columns) => {
      const table2026 = tableOf(2026, processingType, tableName)
      const table2027 = tableOf(2027, processingType, tableName)

      expect(table2027.requiredHeaders).toEqual([
        ...table2026.requiredHeaders,
        ...columns
      ])
      expect(table2026.requiredHeaders).not.toEqual(
        expect.arrayContaining(columns)
      )
    }
  )

  const unchangedTables = Object.values(PROCESSING_TYPES).flatMap(
    (processingType) =>
      Object.keys(tableSchemasOf(toYear(2026), processingType))
        .filter(
          (tableName) =>
            !NEW_COLUMNS.some(
              ([type, changed]) =>
                type === processingType && changed === tableName
            )
        )
        .map((tableName) => [processingType, tableName])
  )

  it.each(Object.values(PROCESSING_TYPES))(
    'has the 2026 %s tables in 2027',
    (processingType) => {
      expect(Object.keys(tableSchemasOf(toYear(2027), processingType))).toEqual(
        Object.keys(tableSchemasOf(toYear(2026), processingType))
      )
    }
  )

  it.each(unchangedTables)(
    'keeps %s %s as it is in 2026',
    (processingType, tableName) => {
      expect(tableOf(2027, processingType, tableName)).toBe(
        tableOf(2026, processingType, tableName)
      )
    }
  )

  describe.each([
    [PROCESSING_TYPES.EXPORTER, 'RECEIVED_LOADS_FOR_EXPORT', 1000],
    [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY, 'LOADS_EXPORTED', 1000]
  ])('%s %s PREVIOUS_YEAR_ROW_ID', (processingType, tableName, minimum) => {
    const table = tableOf(2027, processingType, tableName)
    const errorFor = (value) =>
      table.validationSchema
        .validate({ PREVIOUS_YEAR_ROW_ID: value })
        .error?.details.find(({ path }) => path[0] === 'PREVIOUS_YEAR_ROW_ID')

    it.each([minimum, minimum + 1234])('accepts %s', (value) => {
      expect(errorFor(value)).toBeUndefined()
    })

    it('accepts an empty cell', () => {
      expect(
        table.validationSchema.validate({}).error?.details ?? []
      ).not.toContainEqual(
        expect.objectContaining({ path: ['PREVIOUS_YEAR_ROW_ID'] })
      )
    })

    it.each([
      [minimum - 1, `must be at least ${minimum}`],
      [minimum + 0.5, 'must be an integer'],
      ['abc', 'must be a number']
    ])('rejects %s', (value, message) => {
      expect(errorFor(value)?.message).toBe(message)
    })
  })

  describe.each(NEW_COLUMNS)(
    '%s %s row transformer',
    (processingType, tableName, columns) => {
      const table = tableOf(2027, processingType, tableName)
      const textColumns = columns.filter((c) => c !== 'PREVIOUS_YEAR_ROW_ID')
      const row = { ROW_ID: 3000 }

      it('stores the placeholder columns as entered', () => {
        const values = Object.fromEntries(
          textColumns.map((column, index) => [column, 12345 + index])
        )

        const { data } = table.rowTransformer({ ...row, ...values })

        expect(data).toMatchObject(values)
      })

      it.each(textColumns)('validates %s as free text', (column) => {
        const { error } = table.validationSchema.validate({
          [column]: 'x'.repeat(101)
        })

        expect(error?.details).toContainEqual(
          expect.objectContaining({ path: [column] })
        )
      })

      it('keeps empty placeholder columns empty', () => {
        const values = Object.fromEntries(
          textColumns.map((column) => [column, null])
        )

        const { data } = table.rowTransformer({ ...row, ...values })

        expect(data).toMatchObject(values)
      })

      it('matches the 2026 transformer for the other columns', () => {
        const table2026 = tableOf(2026, processingType, tableName)
        const rowData = { ...row, PREVIOUS_YEAR_ROW_ID: 1500, NET_WEIGHT: 9.5 }

        expect(table.rowTransformer(rowData)).toEqual(
          table2026.rowTransformer(rowData)
        )
      })
    }
  )
})
