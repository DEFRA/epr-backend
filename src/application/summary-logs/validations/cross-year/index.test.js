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
} from '#domain/summary-logs/linked-row.js'
import {
  createDateFieldSchema,
  isDateNoLaterThan
} from '#domain/summary-logs/table-schemas/shared/field-schemas.js'

import { checkCrossYearRules } from './index.js'

/** @import {FilledInRow} from '../../fill-in-linked-rows.js' */
/** @import {Year} from '#common/helpers/dates/year.js' */
/** @import {SummaryLogValidationOptions} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

const HEADERS = [
  'ROW_ID',
  'PREVIOUS_YEAR_ROW_ID',
  'DATE_OF_EXPORT',
  'OSR_NAME',
  'DATE_RECEIVED_BY_OSR',
  'DATE_REPATRIATED',
  'NET_WEIGHT',
  'WAS_THE_WASTE_REFUSED'
]

const tableSchemas = {
  LOADS: {
    rowIdField: 'ROW_ID',
    linking: {
      previousYearRowIdField: 'PREVIOUS_YEAR_ROW_ID',
      suppliableOnLinkedRow: ['DATE_OF_EXPORT'],
      mayDifferBeforeCorrectionDeadline: ['NET_WEIGHT'],
      answeredLaterOnLinkedRow: ['WAS_THE_WASTE_REFUSED'],
      prefilledOnLinkedRow: {},
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
          : []),
        ...(row.WAS_THE_WASTE_STOPPED === 'No'
          ? [
              {
                completion: PREVIOUS_YEAR_ROW_COMPLETION.RECEIVED_BY_OSR,
                field: 'PREVIOUS_YEAR_ROW_ID'
              }
            ]
          : [])
      ]
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

const KEPT_AS_ENTERED = new Set(['ROW_ID', 'PREVIOUS_YEAR_ROW_ID'])

/**
 * @param {Record<string, unknown>} cells
 * @returns {unknown[]}
 */
const rowOf = (cells) => HEADERS.map((header) => cells[header] ?? null)

/**
 * @param {{
 *   rowId?: number | null,
 *   dateOfExport: unknown,
 *   previousYearDateOfExport?: unknown,
 *   suppliedFields?: string[],
 *   previousYearCompletion?: Record<string, unknown>,
 *   dateReceivedByOsr?: string,
 *   osrName?: string | null,
 *   netWeight?: number | null,
 *   wasteRefused?: string | null
 * }} row
 * @returns {FilledInRow}
 */
const filledInRow = ({
  rowId = 1001,
  dateOfExport,
  previousYearDateOfExport = '2026-11-01',
  suppliedFields = ['DATE_OF_EXPORT'],
  previousYearCompletion = {},
  dateReceivedByOsr,
  osrName = null,
  netWeight = null,
  wasteRefused = null
}) => {
  /** @type {Record<string, unknown>} */
  const previousYear = {
    ROW_ID: 1500,
    DATE_OF_EXPORT: previousYearDateOfExport,
    OSR_NAME: 'Overseas 2026 Ltd',
    NET_WEIGHT: 850,
    ...previousYearCompletion
  }
  /** @type {Record<string, unknown>} */
  const enteredCells = {
    ROW_ID: rowId,
    PREVIOUS_YEAR_ROW_ID: 1500,
    DATE_OF_EXPORT: dateOfExport,
    OSR_NAME: osrName,
    DATE_RECEIVED_BY_OSR: dateReceivedByOsr,
    NET_WEIGHT: netWeight,
    WAS_THE_WASTE_REFUSED: wasteRefused
  }
  const entered = rowOf(enteredCells)
  const values = rowOf(
    Object.fromEntries(
      HEADERS.map((header) => [
        header,
        KEPT_AS_ENTERED.has(header) || suppliedFields.includes(header)
          ? enteredCells[header]
          : previousYear[header]
      ])
    )
  )
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
      entered,
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
  values: rowOf({
    ROW_ID: rowId,
    PREVIOUS_YEAR_ROW_ID: previousYearRowId,
    DATE_OF_EXPORT: '2027-01-04',
    OSR_NAME: 'Overseas Ltd'
  }),
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

/**
 * @param {FilledInRow[]} rows
 * @param {SummaryLogValidationOptions} [options]
 * @param {typeof tableSchemas} [schemas]
 */
const check = (
  rows,
  options = BEFORE_2026_CORRECTION_DEADLINE,
  schemas = tableSchemas
) =>
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
    tableSchemas: schemas,
    options
  }).getAllIssues()

describe('checkCrossYearRules', () => {
  it('rejects a date a linked row supplies in an earlier year that can still be corrected', () => {
    expect(
      check([
        filledInRow({
          dateOfExport: '2026-12-28',
          previousYearDateOfExport: null
        })
      ])
    ).toStrictEqual([
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

  it('rejects a supplied date in an earlier year that can still be corrected, in a column that may differ from the previous year row', () => {
    const dateOfExportMayDiffer = {
      LOADS: {
        ...tableSchemas.LOADS,
        linking: {
          ...tableSchemas.LOADS.linking,
          mayDifferBeforeCorrectionDeadline: ['DATE_OF_EXPORT']
        }
      }
    }

    expect(
      check(
        [filledInRow({ dateOfExport: '2026-12-28' })],
        BEFORE_2026_CORRECTION_DEADLINE,
        dateOfExportMayDiffer
      ).map(({ context }) => context?.errorCode)
    ).toStrictEqual([VALIDATION_CODE.DATE_BEFORE_SUMMARY_LOG_YEAR])
  })

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
    expect(
      check([filledInRow({ dateOfExport, previousYearDateOfExport: null })])
    ).toStrictEqual([])
  })

  it('ignores a supplied column with no value rule', () => {
    expect(
      check([
        filledInRow({
          dateOfExport: '2026-11-01',
          suppliedFields: ['DATE_OF_EXPORT', 'OSR_NAME'],
          osrName: 'Overseas Ltd',
          previousYearCompletion: { OSR_NAME: null }
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
        ])
          .filter(
            ({ context }) =>
              context?.errorCode ===
              VALIDATION_CODE.PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR
          )
          .map(({ context }) => context?.actual)
      ).toStrictEqual(['2027-01-05'])
    })

    it('shows the previous year Row ID the linked row entered, for a completion with no date to point at', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            previousYearCompletion: { WAS_THE_WASTE_STOPPED: 'No' }
          })
        ])
      ).toStrictEqual([
        previousYearLinkIssue(
          {
            row: 8,
            rowId: '1001',
            column: 'C',
            header: 'PREVIOUS_YEAR_ROW_ID'
          },
          {
            errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR,
            actual: 1500,
            previousYearRowId: '1500'
          }
        )
      ])
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

    it.for([
      {
        description: 'the values the row gives differently',
        row: {
          dateOfExport: '2026-11-01',
          osrName: 'Overseas Ltd',
          previousYearCompletion: { DATE_RECEIVED_BY_OSR: '2026-12-14' }
        },
        errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR
      },
      {
        description: 'a date the row supplies in an earlier year',
        row: {
          dateOfExport: '2026-12-28',
          previousYearDateOfExport: null,
          previousYearCompletion: { DATE_REPATRIATED: '2026-12-20' }
        },
        errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_REPATRIATED
      }
    ])(
      'reports only that the row cannot be linked, not $description',
      ({ row, errorCode }) => {
        expect(
          check([filledInRow(row)]).map(({ context }) => context?.errorCode)
        ).toStrictEqual([errorCode])
      }
    )

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

  describe('a linked row that gives a value different from the previous year row', () => {
    const OSR_NAME_CELL = {
      row: 8,
      rowId: '1001',
      column: 'E',
      header: 'OSR_NAME'
    }

    it('rejects the column on its cell while the previous year can still be corrected', () => {
      expect(
        check([
          filledInRow({ dateOfExport: '2026-11-01', osrName: 'Overseas Ltd' })
        ])
      ).toStrictEqual([
        previousYearLinkIssue(OSR_NAME_CELL, {
          errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_VALUE_DIFFERS,
          actual: 'Overseas Ltd',
          previousYearRowId: '1500',
          deadline: '2027-02-27'
        })
      ])
    })

    it('rejects a 2026 date the row supplies differently as a different value, not an earlier-year date', () => {
      expect(
        check([filledInRow({ dateOfExport: '2026-12-28' })])
      ).toStrictEqual([
        previousYearLinkIssue(
          { row: 8, rowId: '1001', column: 'D', header: 'DATE_OF_EXPORT' },
          {
            errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_VALUE_DIFFERS,
            actual: '2026-12-28',
            previousYearRowId: '1500',
            deadline: '2027-02-27'
          }
        )
      ])
    })

    it('rejects each column it gives differently, in column order', () => {
      expect(
        check([
          filledInRow({ dateOfExport: '2027-01-20', osrName: 'Overseas Ltd' })
        ]).map(({ context }) => context?.location?.header)
      ).toStrictEqual(['DATE_OF_EXPORT', 'OSR_NAME'])
    })

    it.for([
      {
        description: 'repeats the previous year row',
        osrName: 'Overseas 2026 Ltd'
      },
      { description: 'leaves the column blank', osrName: null }
    ])('accepts a row that $description', ({ osrName }) => {
      expect(
        check([filledInRow({ dateOfExport: '2026-11-01', osrName })])
      ).toStrictEqual([])
    })

    it('accepts a column only the linked row fills', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            osrName: 'Overseas Ltd',
            previousYearCompletion: { OSR_NAME: null }
          })
        ])
      ).toStrictEqual([])
    })

    it.for([
      {
        description:
          'a previous year answer that means not yet, given as another answer',
        previousYear: 'No',
        entered: 'Yes'
      },
      {
        description:
          'a previous year answer that means not yet in lower case, given as another answer',
        previousYear: 'no',
        entered: 'Yes'
      },
      {
        description: 'an answer that repeats the previous year in another case',
        previousYear: 'Yes',
        entered: ' yes '
      }
    ])('accepts $description', ({ previousYear, entered }) => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            wasteRefused: entered,
            previousYearCompletion: { WAS_THE_WASTE_REFUSED: previousYear }
          })
        ])
      ).toStrictEqual([])
    })

    it('rejects a previous year answer given as the answer that means not yet, in any case', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            wasteRefused: 'no',
            previousYearCompletion: { WAS_THE_WASTE_REFUSED: 'YES' }
          })
        ]).map(({ context }) => context?.errorCode)
      ).toStrictEqual([VALIDATION_CODE.PREVIOUS_YEAR_ROW_VALUE_DIFFERS])
    })

    it('rejects a previous year answer given as the answer that means not yet', () => {
      expect(
        check([
          filledInRow({
            dateOfExport: '2026-11-01',
            wasteRefused: 'No',
            previousYearCompletion: { WAS_THE_WASTE_REFUSED: 'Yes' }
          })
        ])
      ).toStrictEqual([
        previousYearLinkIssue(
          {
            row: 8,
            rowId: '1001',
            column: 'I',
            header: 'WAS_THE_WASTE_REFUSED'
          },
          {
            errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_VALUE_DIFFERS,
            actual: 'No',
            previousYearRowId: '1500',
            deadline: '2027-02-27'
          }
        )
      ])
    })

    it('accepts a column that may differ before the correction deadline', () => {
      expect(
        check([filledInRow({ dateOfExport: '2026-11-01', netWeight: 0 })])
      ).toStrictEqual([])
    })

    it.for([
      {
        description: 'an accredited operator on the last correction day',
        registeredOnly: false,
        createdAt: '2027-02-27T23:59:59.000Z',
        deadline: '2027-02-27'
      },
      {
        description: 'a registered-only operator on the last correction day',
        registeredOnly: true,
        createdAt: '2027-03-20T23:59:59.000Z',
        deadline: '2027-03-20'
      }
    ])(
      'rejects it for $description',
      ({ registeredOnly, createdAt, deadline }) => {
        expect(
          check(
            [
              filledInRow({
                dateOfExport: '2026-11-01',
                osrName: 'Overseas Ltd'
              })
            ],
            {
              ...BEFORE_2026_CORRECTION_DEADLINE,
              registeredOnly,
              createdAt: new Date(createdAt)
            }
          )
        ).toStrictEqual([
          previousYearLinkIssue(OSR_NAME_CELL, {
            errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_VALUE_DIFFERS,
            actual: 'Overseas Ltd',
            previousYearRowId: '1500',
            deadline
          })
        ])
      }
    )

    it.for([
      {
        description:
          'an accredited operator the day after the correction deadline',
        registeredOnly: false,
        createdAt: '2027-02-28T00:00:00.000Z'
      },
      {
        description:
          'a registered-only operator the day after the correction deadline',
        registeredOnly: true,
        createdAt: '2027-03-21T00:00:00.000Z'
      }
    ])('accepts it for $description', ({ registeredOnly, createdAt }) => {
      expect(
        check(
          [
            filledInRow({ dateOfExport: '2026-11-01', osrName: 'Overseas Ltd' })
          ],
          {
            ...BEFORE_2026_CORRECTION_DEADLINE,
            registeredOnly,
            createdAt: new Date(createdAt)
          }
        )
      ).toStrictEqual([])
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
