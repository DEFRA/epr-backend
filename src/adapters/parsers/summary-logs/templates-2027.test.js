import { readFile } from 'node:fs/promises'

import { toYear } from '#common/helpers/dates/year.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  unfilledValuesForYear,
  tableSchemasOf
} from '#domain/summary-logs/table-schemas/index.js'

import { parse, PARSE_DEFAULTS } from './exceljs-parser.js'

describe('2027 summary log templates', () => {
  describe.each([
    {
      fixture: 'summary-log-exporter.xlsx',
      processingType: PROCESSING_TYPES.EXPORTER
    },
    {
      fixture: 'summary-log-exporter-registered-only.xlsx',
      processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
    },
    {
      fixture: 'summary-log-reprocessor-input.xlsx',
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
    },
    {
      fixture: 'summary-log-reprocessor-output.xlsx',
      processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
    },
    {
      fixture: 'summary-log-reprocessor-registered-only.xlsx',
      processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
    }
  ])('$fixture', ({ fixture, processingType }) => {
    /** @type {Awaited<ReturnType<typeof parse>>} */
    let parsed

    beforeAll(async () => {
      const buffer = await readFile(
        new URL(
          import.meta.resolve(
            `#data/fixtures/spreadsheet/templates/2027.01/${fixture}`
          )
        )
      )
      parsed = await parse(buffer, {
        requiredWorksheet: 'Cover',
        ...PARSE_DEFAULTS,
        unfilledValues: unfilledValuesForYear(toYear(2027))
      })
    }, 50_000)

    it('is a 2027.01 template for its processing type', () => {
      expect(parsed.meta.PROCESSING_TYPE.value).toBe(processingType)
      expect(parsed.meta.TEMPLATE_VERSION.value).toBe(2027.01)
    })

    it('has the tables of the 2027 template definition', () => {
      const tableSchemas = tableSchemasOf(toYear(2027), processingType)

      expect(Object.keys(parsed.data).sort()).toEqual(
        Object.keys(tableSchemas).sort()
      )
    })

    it.each(Object.entries(tableSchemasOf(toYear(2027), processingType)))(
      'has the %s headers of the 2027 template definition',
      (tableName, schema) => {
        const headers = parsed.data[tableName].headers.filter(Boolean)
        expect([...headers].sort()).toEqual([...schema.requiredHeaders].sort())
      }
    )
  })
})
