import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { toYear } from '#common/helpers/dates/year.js'
import {
  getTemplate,
  unfilledValuesForYear
} from '#domain/summary-logs/table-schemas/index.js'

import { parse, PARSE_DEFAULTS } from './exceljs-parser.js'

const TEMPLATES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../data/fixtures/spreadsheet/templates/2027.01'
)

describe('2027 summary log templates', () => {
  describe.each([
    { fixture: 'summary-log-exporter.xlsx', processingType: 'EXPORTER' },
    {
      fixture: 'summary-log-reprocessor-registered-only.xlsx',
      processingType: 'REPROCESSOR_REGISTERED_ONLY'
    }
  ])('$fixture', ({ fixture, processingType }) => {
    /** @type {Awaited<ReturnType<typeof parse>>} */
    let parsed

    beforeAll(async () => {
      const buffer = await readFile(path.join(TEMPLATES_DIR, fixture))
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
      const { tableSchemas } = getTemplate(toYear(2027), processingType)

      expect(Object.keys(parsed.data).sort()).toEqual(
        Object.keys(tableSchemas).sort()
      )
    })

    it.each(
      Object.entries(getTemplate(toYear(2027), processingType).tableSchemas)
    )(
      'has the %s headers of the 2027 template definition',
      (tableName, schema) => {
        const headers = parsed.data[tableName].headers.filter(Boolean)
        expect([...headers].sort()).toEqual([...schema.requiredHeaders].sort())
      }
    )
  })
})
