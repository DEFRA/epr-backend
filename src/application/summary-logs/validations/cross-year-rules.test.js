import Joi from 'joi'

import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { toYear } from '#common/helpers/dates/year.js'
import { createDateFieldSchema } from '#domain/summary-logs/table-schemas/shared/field-schemas.js'

import { checkCrossYearRules } from './cross-year-rules.js'

/** @import {FilledInRow} from '../fill-in-linked-rows.js' */
/** @import {SummaryLogValidationOptions} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

const HEADERS = ['ROW_ID', 'PREVIOUS_YEAR_ROW_ID', 'DATE_OF_EXPORT', 'OSR_NAME']

const tableSchemas = {
  LOADS: {
    rowIdField: 'ROW_ID',
    validationSchema: Joi.object({
      ROW_ID: Joi.number(),
      PREVIOUS_YEAR_ROW_ID: Joi.number(),
      DATE_OF_EXPORT: createDateFieldSchema({ rejectOpenEarlierYear: true })
    }).unknown(true)
  }
}

/** @type {SummaryLogValidationOptions} */
const BEFORE_2026_CORRECTION_DEADLINE = {
  summaryLogYear: toYear(2027),
  createdAt: new Date('2027-01-10T09:00:00.000Z'),
  registeredOnly: false
}

/**
 * @param {{
 *   dateOfExport: unknown,
 *   previousYearDateOfExport?: unknown,
 *   suppliedFields?: string[]
 * }} row
 * @returns {FilledInRow}
 */
const filledInRow = ({
  dateOfExport,
  previousYearDateOfExport = '2026-11-01',
  suppliedFields = ['DATE_OF_EXPORT']
}) => ({
  rowNumber: 8,
  values: [1001, 1500, dateOfExport, 'Overseas Ltd'],
  linked: {
    link: {
      year: toYear(2026),
      rowId: '1500',
      rowStateId: 'row-state-1500',
      suppliedFields
    },
    entered: [1001, 1500, dateOfExport, 'Overseas Ltd'],
    previousYear: {
      ROW_ID: 1500,
      DATE_OF_EXPORT: previousYearDateOfExport,
      OSR_NAME: 'Overseas 2026 Ltd'
    }
  }
})

/** @param {FilledInRow[]} rows */
const check = (rows, options = BEFORE_2026_CORRECTION_DEADLINE) =>
  checkCrossYearRules({
    parsed: {
      meta: {},
      data: {
        LOADS: {
          location: { sheet: 'Exported', row: 7, column: 'B' },
          headers: HEADERS,
          rows
        }
      }
    },
    tableSchemas,
    options
  }).getAllIssues()

describe('checkCrossYearRules', () => {
  it('rejects a date a linked row supplies in an earlier year that can still be corrected', () => {
    expect(check([filledInRow({ dateOfExport: '2026-12-28' })])).toStrictEqual([
      {
        category: VALIDATION_CATEGORY.TECHNICAL,
        severity: VALIDATION_SEVERITY.FATAL,
        message:
          "Invalid value in column 'DATE_OF_EXPORT': must not be in an earlier year whose summary log is still open",
        code: VALIDATION_CODE.INVALID_DATE,
        context: {
          location: {
            sheet: 'Exported',
            table: 'LOADS',
            row: 8,
            rowId: '1001',
            column: 'D',
            header: 'DATE_OF_EXPORT'
          },
          actual: '2026-12-28',
          expected: 2027,
          deadline: '2027-02-27',
          errorCode: VALIDATION_CODE.DATE_BEFORE_SUMMARY_LOG_YEAR
        }
      }
    ])
  })

  it.each([
    ['as text', '2026-12-28'],
    ['as a date cell', new Date('2026-12-28T00:00:00.000Z')]
  ])(
    'accepts a supplied date that repeats the previous-year row, stored %s',
    (_, previousYearDateOfExport) => {
      expect(
        check([
          filledInRow({ dateOfExport: '2026-12-28', previousYearDateOfExport })
        ])
      ).toStrictEqual([])
    }
  )

  it('accepts a supplied date once the earlier year can no longer be corrected', () => {
    expect(
      check([filledInRow({ dateOfExport: '2026-12-28' })], {
        ...BEFORE_2026_CORRECTION_DEADLINE,
        createdAt: new Date('2027-02-28T00:00:00.000Z')
      })
    ).toStrictEqual([])
  })

  it('leaves a date the row did not supply, taken from the previous-year row, alone', () => {
    expect(
      check([
        filledInRow({
          dateOfExport: '2026-12-28',
          previousYearDateOfExport: '2026-12-28',
          suppliedFields: []
        })
      ])
    ).toStrictEqual([])
  })

  it.each([
    ['a date in a later year', '2028-01-05'],
    ['an invalid date', 'not a date']
  ])('leaves %s to the data syntax check', (_, dateOfExport) => {
    expect(check([filledInRow({ dateOfExport })])).toStrictEqual([])
  })

  it('ignores a supplied column with no value rule', () => {
    expect(
      check([
        filledInRow({
          dateOfExport: '2026-11-01',
          suppliedFields: ['DATE_OF_EXPORT', 'OSR_NAME']
        })
      ])
    ).toStrictEqual([])
  })

  it('ignores a row not filled in from a previous-year row', () => {
    const { linked: _, ...unlinked } = filledInRow({
      dateOfExport: '2026-12-28'
    })
    expect(check([unlinked])).toStrictEqual([])
  })

  it('ignores a table it has no schema for', () => {
    expect(
      checkCrossYearRules({
        parsed: {
          meta: {},
          data: {
            UNKNOWN: {
              location: { sheet: 'Other', row: 1, column: 'A' },
              headers: HEADERS,
              rows: [filledInRow({ dateOfExport: '2026-12-28' })]
            }
          }
        },
        tableSchemas,
        options: BEFORE_2026_CORRECTION_DEADLINE
      }).getAllIssues()
    ).toStrictEqual([])
  })
})
