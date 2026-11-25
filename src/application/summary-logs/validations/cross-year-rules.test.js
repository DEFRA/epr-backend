import Joi from 'joi'

import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { toYear } from '#common/helpers/dates/year.js'
import {
  PREVIOUS_YEAR_LINK_STATUS,
  PREVIOUS_YEAR_ROW_COMPLETION
} from '#domain/summary-logs/previous-year-link.js'
import {
  createDateFieldSchema,
  isDateNoLaterThan
} from '#domain/summary-logs/table-schemas/shared/field-schemas.js'

import { checkCrossYearRules } from './cross-year-rules.js'

/** @import {FilledInRow} from '../fill-in-linked-rows.js' */
/** @import {Year} from '#common/helpers/dates/year.js' */
/** @import {SummaryLogValidationOptions} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

const HEADERS = [
  'ROW_ID',
  'PREVIOUS_YEAR_ROW_ID',
  'DATE_OF_EXPORT',
  'OSR_NAME',
  'DATE_RECEIVED_BY_OSR',
  'DATE_REPATRIATED'
]

const tableSchemas = {
  LOADS: {
    rowIdField: 'ROW_ID',
    linking: {
      previousYearRowIdField: 'PREVIOUS_YEAR_ROW_ID',
      suppliableOnLinkedRow: ['DATE_OF_EXPORT'],
      /** @param {Record<string, unknown>} row */
      /**
       * @param {Record<string, unknown>} row
       * @param {Year} year
       */
      completionsOf: (row, year) => [
        ...(isDateNoLaterThan(row.DATE_RECEIVED_BY_OSR, year)
          ? [
              {
                completion: PREVIOUS_YEAR_ROW_COMPLETION.RECEIVED_BY_OSR,
                field: 'DATE_RECEIVED_BY_OSR'
              }
            ]
          : []),
        ...(row.DATE_REPATRIATED
          ? [
              {
                completion: PREVIOUS_YEAR_ROW_COMPLETION.REPATRIATED,
                field: 'DATE_REPATRIATED'
              }
            ]
          : [])
      ],
      /** @param {Record<string, unknown>} row */
      missingFieldsOf: (row) => (row.OSR_NAME ? [] : ['OSR_NAME'])
    },
    validationSchema: Joi.object({
      ROW_ID: Joi.number(),
      PREVIOUS_YEAR_ROW_ID: Joi.number().integer().min(1000),
      DATE_OF_EXPORT: createDateFieldSchema()
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
 *   rowId?: number | null,
 *   dateOfExport: unknown,
 *   previousYearDateOfExport?: unknown,
 *   suppliedFields?: string[],
 *   previousYearOsrName?: string | null,
 *   previousYearCompletion?: Record<string, unknown>,
 *   dateReceivedByOsr?: string
 * }} row
 * @returns {FilledInRow}
 */
const filledInRow = ({
  rowId = 1001,
  dateOfExport,
  previousYearDateOfExport = '2026-11-01',
  suppliedFields = ['DATE_OF_EXPORT'],
  previousYearOsrName = 'Overseas 2026 Ltd',
  previousYearCompletion = {},
  dateReceivedByOsr
}) => {
  /** @type {Record<string, unknown>} */
  const previousYear = {
    ROW_ID: 1500,
    DATE_OF_EXPORT: previousYearDateOfExport,
    OSR_NAME: previousYearOsrName,
    ...previousYearCompletion
  }
  const values = [
    rowId,
    1500,
    dateOfExport,
    'Overseas Ltd',
    dateReceivedByOsr ?? previousYear.DATE_RECEIVED_BY_OSR ?? null,
    previousYear.DATE_REPATRIATED ?? null
  ]
  return {
    rowNumber: 8,
    values,
    previousYearLink: {
      status: PREVIOUS_YEAR_LINK_STATUS.FOUND,
      link: {
        year: toYear(2026),
        rowId: '1500',
        rowStateId: 'row-state-1500',
        suppliedFields
      },
      entered: values,
      previousYear
    }
  }
}

/**
 * @param {{ rowNumber?: number, rowId?: number | string | null, previousYearRowId: unknown }} row
 * @returns {FilledInRow}
 */
const unmatchedRow = ({ rowNumber = 8, rowId = 1001, previousYearRowId }) => ({
  rowNumber,
  values: [rowId, previousYearRowId, '2027-01-04', 'Overseas Ltd', null, null],
  previousYearLink: {
    status: PREVIOUS_YEAR_LINK_STATUS.NOT_FOUND,
    previousYearRowId: String(previousYearRowId)
  }
})

/**
 * @param {{ row: number, rowId: string, column: string, header: string }} cell
 * @param {{ errorCode: string, actual: unknown, previousYearRowId?: string, deadline?: string }} issue
 */
const previousYearLinkIssue = (
  cell,
  { errorCode, actual, previousYearRowId, deadline }
) => ({
  category: VALIDATION_CATEGORY.BUSINESS,
  severity: VALIDATION_SEVERITY.FATAL,
  message: `Previous year link ${errorCode} in column '${cell.header}'`,
  code: VALIDATION_CODE.PREVIOUS_YEAR_LINK,
  context: {
    location: { sheet: 'Exported', table: 'LOADS', ...cell },
    actual,
    expected: 2026,
    errorCode,
    ...(previousYearRowId && { previousYearRowId }),
    ...(deadline && { deadline })
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

  it('rejects a linked row with no row ID, without checking its dates', () => {
    expect(
      check([filledInRow({ rowId: null, dateOfExport: '2026-12-28' })])
    ).toStrictEqual([
      {
        category: VALIDATION_CATEGORY.TECHNICAL,
        severity: VALIDATION_SEVERITY.FATAL,
        message: 'Missing required field: ROW_ID',
        code: VALIDATION_CODE.FIELD_REQUIRED,
        context: {
          location: {
            sheet: 'Exported',
            table: 'LOADS',
            row: 8,
            column: 'B',
            header: 'ROW_ID'
          },
          actual: null
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
    const { previousYearLink: _, ...unlinked } = filledInRow({
      dateOfExport: '2026-12-28'
    })
    expect(check([unlinked])).toStrictEqual([])
  })

  describe('a previous year row ID that names no previous-year row', () => {
    it('rejects the row on its previous year row ID', () => {
      expect(check([unmatchedRow({ previousYearRowId: 1888 })])).toStrictEqual([
        previousYearLinkIssue(
          {
            row: 8,
            rowId: '1001',
            column: 'C',
            header: 'PREVIOUS_YEAR_ROW_ID'
          },
          {
            errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_NOT_FOUND,
            actual: 1888
          }
        )
      ])
    })

    it('rejects every row naming one, even the same one', () => {
      expect(
        check([
          unmatchedRow({ previousYearRowId: 1888 }),
          unmatchedRow({ rowNumber: 9, rowId: 1002, previousYearRowId: 1888 })
        ]).map(({ context }) => context?.location?.rowId)
      ).toStrictEqual(['1001', '1002'])
    })

    it.each([
      ['text', 'abc'],
      ['a number below the lowest row ID', 12]
    ])(
      'leaves one that is %s to the data syntax check',
      (_, previousYearRowId) => {
        expect(check([unmatchedRow({ previousYearRowId })])).toStrictEqual([])
      }
    )

    it("ignores the template's description row", () => {
      expect(
        check([
          unmatchedRow({
            rowId: 'Row ID (auto-filled)',
            previousYearRowId: 1888
          })
        ])
      ).toStrictEqual([])
    })

    it('ignores a row with no row ID', () => {
      expect(
        check([unmatchedRow({ rowId: null, previousYearRowId: 16003 })])
      ).toStrictEqual([])
    })

    it('does not depend on the correction deadline', () => {
      expect(
        check([unmatchedRow({ previousYearRowId: 1888 })], {
          ...BEFORE_2026_CORRECTION_DEADLINE,
          createdAt: new Date('2027-06-01T00:00:00.000Z')
        })
      ).toHaveLength(1)
    })
  })

  describe('a previous year row that is complete', () => {
    it('rejects a link to a received load on its received date, left blank', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            previousYearCompletion: { DATE_RECEIVED_BY_OSR: '2026-12-14' }
          })
        ])
      ).toStrictEqual([
        previousYearLinkIssue(
          {
            row: 8,
            rowId: '1001',
            column: 'F',
            header: 'DATE_RECEIVED_BY_OSR'
          },
          {
            errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR,
            actual: null,
            previousYearRowId: '1500'
          }
        )
      ])
    })

    it('shows the received date the linked row entered itself', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            previousYearCompletion: { DATE_RECEIVED_BY_OSR: '2026-12-14' },
            dateReceivedByOsr: '2027-01-05',
            suppliedFields: ['DATE_OF_EXPORT', 'DATE_RECEIVED_BY_OSR']
          })
        ]).map(({ context }) => context?.actual)
      ).toStrictEqual(['2027-01-05'])
    })

    it('accepts a link to a row whose received date is after its year', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            previousYearCompletion: { DATE_RECEIVED_BY_OSR: '2027-01-05' }
          })
        ])
      ).toStrictEqual([])
    })

    it('rejects a link to a repatriated load on its repatriation date, left blank', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            previousYearCompletion: { DATE_REPATRIATED: '2026-12-20' }
          })
        ])
      ).toStrictEqual([
        previousYearLinkIssue(
          { row: 8, rowId: '1001', column: 'G', header: 'DATE_REPATRIATED' },
          {
            errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_REPATRIATED,
            actual: null,
            previousYearRowId: '1500'
          }
        )
      ])
    })

    it('rejects a link to a load both received and repatriated on both dates', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            previousYearCompletion: {
              DATE_RECEIVED_BY_OSR: '2026-12-14',
              DATE_REPATRIATED: '2026-12-20'
            }
          })
        ]).map(({ context }) => context?.errorCode)
      ).toStrictEqual([
        VALIDATION_CODE.PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR,
        VALIDATION_CODE.PREVIOUS_YEAR_ROW_REPATRIATED
      ])
    })

    it('does not depend on the correction deadline', () => {
      expect(
        check(
          [
            filledInRow({
              dateOfExport: '2026-11-01',
              previousYearCompletion: { DATE_RECEIVED_BY_OSR: '2026-12-14' }
            })
          ],
          {
            ...BEFORE_2026_CORRECTION_DEADLINE,
            createdAt: new Date('2027-06-01T00:00:00.000Z')
          }
        )
      ).toHaveLength(1)
    })
  })

  describe('a previous year row missing data it should already hold', () => {
    const missingOsrName = filledInRow({
      dateOfExport: '2026-11-01',
      previousYearOsrName: null
    })

    it("rejects the row on the missing column's cell, showing the previous year's blank", () => {
      expect(check([missingOsrName])).toStrictEqual([
        previousYearLinkIssue(
          { row: 8, rowId: '1001', column: 'E', header: 'OSR_NAME' },
          {
            errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_MISSING_DATA,
            actual: null,
            previousYearRowId: '1500',
            deadline: '2027-02-27'
          }
        )
      ])
    })

    it('accepts a previous year row holding everything it should', () => {
      expect(
        check([filledInRow({ dateOfExport: '2026-11-01' })])
      ).toStrictEqual([])
    })

    it('rejects alongside a link to a complete row', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            previousYearOsrName: null,
            previousYearCompletion: { DATE_RECEIVED_BY_OSR: '2026-12-14' }
          })
        ]).map(({ context }) => context?.errorCode)
      ).toStrictEqual([
        VALIDATION_CODE.PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR,
        VALIDATION_CODE.PREVIOUS_YEAR_ROW_MISSING_DATA
      ])
    })

    it.each([
      ['accredited', false, '2027-02-27T23:59:59.000Z', '2027-02-27'],
      ['registered-only', true, '2027-03-20T23:59:59.000Z', '2027-03-20']
    ])(
      'rejects %s uploads on the last correction day',
      (_, registeredOnly, createdAt, deadline) => {
        expect(
          check([missingOsrName], {
            ...BEFORE_2026_CORRECTION_DEADLINE,
            registeredOnly,
            createdAt: new Date(createdAt)
          }).map(({ context }) => context?.deadline)
        ).toStrictEqual([deadline])
      }
    )

    it.each([
      ['accredited', false, '2027-02-28T00:00:00.000Z'],
      ['registered-only', true, '2027-03-21T00:00:00.000Z']
    ])(
      'accepts %s uploads the day after the correction deadline',
      (_, registeredOnly, createdAt) => {
        expect(
          check([missingOsrName], {
            ...BEFORE_2026_CORRECTION_DEADLINE,
            registeredOnly,
            createdAt: new Date(createdAt)
          })
        ).toStrictEqual([])
      }
    )

    it('rejects a registered-only upload after the accredited deadline', () => {
      expect(
        check([missingOsrName], {
          ...BEFORE_2026_CORRECTION_DEADLINE,
          registeredOnly: true,
          createdAt: new Date('2027-03-01T09:00:00.000Z')
        })
      ).toHaveLength(1)
    })
  })

  it('ignores a table that does not link years', () => {
    expect(
      checkCrossYearRules({
        parsed: {
          meta: {},
          data: {
            LOADS: {
              location: { sheet: 'Exported', row: 7, column: 'B' },
              headers: HEADERS,
              rows: [unmatchedRow({ previousYearRowId: 1888 })]
            }
          }
        },
        tableSchemas: {
          LOADS: {
            rowIdField: 'ROW_ID',
            validationSchema: tableSchemas.LOADS.validationSchema
          }
        },
        options: BEFORE_2026_CORRECTION_DEADLINE
      }).getAllIssues()
    ).toStrictEqual([])
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
