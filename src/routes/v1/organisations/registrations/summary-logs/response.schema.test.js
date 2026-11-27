import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { LEDGER_ACCREDITATION_KIND } from '#domain/organisations/model.js'
import { emptyLoadsByReportingPeriod } from '#domain/summary-logs/loads-by-period-status-schema.js'

import {
  summaryLogGetResponseSchema,
  summaryLogResponseSchema
} from './response.schema.js'
import { expectValidationError } from '#common/validation/validation-test-helpers.js'

const REGISTERED_ONLY = { kind: LEDGER_ACCREDITATION_KIND.REGISTERED_ONLY }

describe('summaryLogResponseSchema', () => {
  it('should require year', () => {
    const details = expectValidationError(summaryLogResponseSchema, {
      status: SUMMARY_LOG_STATUS.PREPROCESSING
    })

    expect(details).toStrictEqual([
      expect.objectContaining({ type: 'any.required', path: ['year'] })
    ])
  })

  it('should require the accreditation the ledger is kept against', () => {
    const details = expectValidationError(summaryLogResponseSchema, {
      status: SUMMARY_LOG_STATUS.PREPROCESSING,
      year: 2026
    })

    expect(details).toStrictEqual([
      expect.objectContaining({
        type: 'any.required',
        path: ['ledgerAccreditation']
      })
    ])
  })

  describe('summaryLogGetResponseSchema', () => {
    it('accepts the placeholder for a summary log not yet stored', () => {
      const { error } = summaryLogGetResponseSchema.validate({
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })

      expect(error).toBeUndefined()
    })

    it('names the missing year of a stored summary log', () => {
      const details = expectValidationError(summaryLogGetResponseSchema, {
        status: SUMMARY_LOG_STATUS.INVALID
      })

      expect(details).toStrictEqual([
        expect.objectContaining({ type: 'any.required', path: ['year'] })
      ])
    })
  })

  describe('failures', () => {
    const invalidWith = (failure) => ({
      status: SUMMARY_LOG_STATUS.INVALID,
      year: 2026,
      ledgerAccreditation: REGISTERED_ONLY,
      validation: {
        failures: [failure],
        concerns: {},
        counts: { fatal: 1, error: 0, warning: 0, total: 1 }
      }
    })

    const FAILURE_PATH = ['validation', 'failures', 0]

    it('should require each failure to say what kind it is', () => {
      const details = expectValidationError(
        summaryLogResponseSchema,
        invalidWith({ code: 'FILE_EMPTY', errorCode: 'FILE_EMPTY' })
      )

      expect(details).toStrictEqual([
        expect.objectContaining({
          type: 'any.required',
          path: [...FAILURE_PATH, 'kind']
        })
      ])
    })

    it('should reject a kind it does not know', () => {
      const details = expectValidationError(
        summaryLogResponseSchema,
        invalidWith({
          kind: 'sheet',
          code: 'FILE_EMPTY',
          errorCode: 'FILE_EMPTY'
        })
      )

      expect(details).toStrictEqual([
        expect.objectContaining({
          type: 'any.only',
          path: [...FAILURE_PATH, 'kind']
        })
      ])
    })

    const LOCATED_FAILURES = [
      {
        kind: 'meta',
        code: 'REGISTRATION_MISMATCH',
        errorCode: 'REGISTRATION_MISMATCH',
        location: {
          field: 'REGISTRATION_NUMBER',
          sheet: 'Cover',
          row: 4,
          column: 'C'
        },
        actual: 'R26ER0000000000PL',
        expected: 'R26ER5001180041PL'
      },
      {
        kind: 'table',
        code: 'HEADER_REQUIRED',
        errorCode: 'HEADER_REQUIRED',
        location: { sheet: 'Exported', table: 'RECEIVED_LOADS_FOR_EXPORT' },
        expected: 'OSR_ID'
      },
      {
        kind: 'removedRow',
        code: 'SEQUENTIAL_ROW_REMOVED',
        errorCode: 'SEQUENTIAL_ROW_REMOVED',
        location: {
          sheet: 'Exported',
          table: 'RECEIVED_LOADS_FOR_EXPORT',
          rowId: '1000'
        }
      },
      {
        kind: 'cell',
        code: 'FIELD_REQUIRED',
        errorCode: 'FIELD_REQUIRED',
        location: {
          sheet: 'Exported',
          table: 'RECEIVED_LOADS_FOR_EXPORT',
          row: 8,
          rowId: '1001',
          column: 'U',
          header: 'DATE_OF_EXPORT'
        }
      }
    ]

    const VALID_FAILURES = [
      { kind: 'file', code: 'FILE_EMPTY', errorCode: 'FILE_EMPTY' },
      {
        kind: 'meta',
        code: 'MATERIAL_REQUIRED',
        errorCode: 'MATERIAL_REQUIRED',
        location: { field: 'MATERIAL' }
      },
      ...LOCATED_FAILURES,
      {
        kind: 'cell',
        code: 'FIELD_REQUIRED',
        errorCode: 'FIELD_REQUIRED',
        location: {
          sheet: 'Exported',
          table: 'RECEIVED_LOADS_FOR_EXPORT',
          row: 8,
          column: 'B',
          header: 'ROW_ID'
        }
      }
    ]

    it.for(VALID_FAILURES)(
      'should accept a $kind failure where it is',
      (failure) => {
        const { error } = summaryLogResponseSchema.validate(
          invalidWith(failure)
        )

        expect(error).toBeUndefined()
      }
    )

    it('should reject a file failure that has a location', () => {
      const details = expectValidationError(
        summaryLogResponseSchema,
        invalidWith({
          kind: 'file',
          code: 'FILE_EMPTY',
          errorCode: 'FILE_EMPTY',
          location: { field: 'MATERIAL' }
        })
      )

      expect(details).toStrictEqual([
        expect.objectContaining({
          type: 'object.unknown',
          path: [...FAILURE_PATH, 'location']
        })
      ])
    })

    it.for(LOCATED_FAILURES)(
      'should require a location on a $kind failure',
      ({ location: _omitted, ...failure }) => {
        const details = expectValidationError(
          summaryLogResponseSchema,
          invalidWith(failure)
        )

        expect(details).toStrictEqual([
          expect.objectContaining({
            type: 'any.required',
            path: [...FAILURE_PATH, 'location']
          })
        ])
      }
    )

    it.for(
      LOCATED_FAILURES.flatMap((failure) =>
        Object.keys(failure.location)
          .filter((key) => !(failure.kind === 'meta' && key !== 'field'))
          .filter((key) => key !== 'rowId' || failure.kind !== 'cell')
          .map((key) => ({ kind: failure.kind, key, failure }))
      )
    )(
      'should require the $key of a $kind failure',
      ({ key, failure: { location, ...failure } }) => {
        const { [key]: _omitted, ...partial } = location

        const details = expectValidationError(
          summaryLogResponseSchema,
          invalidWith({ ...failure, location: partial })
        )

        expect(details).toStrictEqual([
          expect.objectContaining({
            path: [...FAILURE_PATH, 'location', key]
          })
        ])
      }
    )

    it('should reject a meta failure placed at part of a cell', () => {
      const details = expectValidationError(
        summaryLogResponseSchema,
        invalidWith({
          kind: 'meta',
          code: 'MATERIAL_REQUIRED',
          errorCode: 'MATERIAL_REQUIRED',
          location: { field: 'MATERIAL', sheet: 'Cover' }
        })
      )

      expect(details).toStrictEqual([
        expect.objectContaining({
          type: 'object.and',
          path: [...FAILURE_PATH, 'location']
        })
      ])
    })
  })

  const CELL = {
    sheet: 'Exported',
    table: 'RECEIVED_LOADS_FOR_EXPORT',
    row: 8,
    rowId: '1001',
    column: 'U',
    header: 'DATE_OF_EXPORT'
  }

  const invalidWithConcern = (issue) => ({
    status: SUMMARY_LOG_STATUS.INVALID,
    year: 2027,
    ledgerAccreditation: REGISTERED_ONLY,
    validation: {
      failures: [],
      concerns: {
        [CELL.table]: {
          sheet: CELL.sheet,
          rows: [{ row: CELL.row, issues: [issue] }]
        }
      },
      counts: { fatal: 0, error: 1, warning: 0, total: 1 }
    }
  })

  const CONCERN_PATH = [
    'validation',
    'concerns',
    CELL.table,
    'rows',
    0,
    'issues',
    0
  ]

  describe('concerns', () => {
    const CONCERN = {
      type: 'error',
      code: 'FIELD_REQUIRED',
      errorCode: 'FIELD_REQUIRED',
      header: CELL.header,
      column: CELL.column
    }

    it('should accept a concern at a cell', () => {
      const { error } = summaryLogResponseSchema.validate(
        invalidWithConcern(CONCERN)
      )

      expect(error).toBeUndefined()
    })

    it.for(['type', 'header', 'column'])(
      'should require the %s of a concern',
      (field) => {
        const { [field]: _omitted, ...concern } = CONCERN

        const details = expectValidationError(
          summaryLogResponseSchema,
          invalidWithConcern(concern)
        )

        expect(details).toStrictEqual([
          expect.objectContaining({
            type: 'any.required',
            path: [...CONCERN_PATH, field]
          })
        ])
      }
    )
  })

  describe.for([
    {
      place: 'failure',
      responseWith: (fields) => ({
        status: SUMMARY_LOG_STATUS.INVALID,
        year: 2027,
        ledgerAccreditation: REGISTERED_ONLY,
        validation: {
          failures: [
            {
              kind: 'cell',
              code: 'PREVIOUS_YEAR_LINK',
              location: CELL,
              ...fields
            }
          ],
          concerns: {},
          counts: { fatal: 1, error: 0, warning: 0, total: 1 }
        }
      }),
      path: ['validation', 'failures', 0]
    },
    {
      place: 'concern',
      responseWith: (fields) =>
        invalidWithConcern({
          type: 'error',
          code: 'PREVIOUS_YEAR_LINK',
          header: CELL.header,
          column: CELL.column,
          ...fields
        }),
      path: CONCERN_PATH
    }
  ])('cell message fields on a $place', ({ responseWith, path }) => {
    /** @typedef {{ errorCode: string } & Record<string, unknown>} CellMessage */

    /** @type {CellMessage} */
    const EARLIER_YEAR_DATE = {
      errorCode: 'DATE_BEFORE_SUMMARY_LOG_YEAR',
      expected: 2027,
      deadline: '2027-02-27'
    }

    /** @type {CellMessage} */
    const COMPLETE_ROW_LINK = {
      errorCode: 'PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR',
      expected: 2026,
      previousYearRowId: '1500'
    }

    /** @type {CellMessage[]} */
    const COMPLETE_MESSAGES = [
      { errorCode: 'DATE_AFTER_SUMMARY_LOG_YEAR', expected: 2027 },
      EARLIER_YEAR_DATE,
      { errorCode: 'PREVIOUS_YEAR_ROW_NOT_FOUND', expected: 2026 },
      COMPLETE_ROW_LINK,
      {
        errorCode: 'PREVIOUS_YEAR_ROW_REPATRIATED',
        expected: 2026,
        previousYearRowId: '1500'
      },
      {
        errorCode: 'PREVIOUS_YEAR_ROW_VALUE_DIFFERS',
        expected: 2026,
        previousYearRowId: '1500',
        deadline: '2027-02-27'
      }
    ]

    it.for(COMPLETE_MESSAGES)(
      'should accept $errorCode with the fields its message needs',
      (message) => {
        const { error } = summaryLogResponseSchema.validate(
          responseWith(message)
        )

        expect(error).toBeUndefined()
      }
    )

    it.for(
      COMPLETE_MESSAGES.flatMap((message) =>
        Object.keys(message)
          .filter((field) => field !== 'errorCode')
          .map((field) => ({ errorCode: message.errorCode, field, message }))
      )
    )('should require $field on $errorCode', ({ field, message: complete }) => {
      const { [field]: _omitted, ...message } = complete

      const details = expectValidationError(
        summaryLogResponseSchema,
        responseWith(message)
      )

      expect(details).toStrictEqual([
        expect.objectContaining({
          type: 'any.required',
          path: [...path, field]
        })
      ])
    })

    /** @type {[description: string, message: CellMessage][]} */
    const INVALID_MESSAGES = [
      [
        'a year that is not a whole number',
        { ...EARLIER_YEAR_DATE, expected: 2027.5 }
      ],
      [
        'a deadline with a time',
        { ...EARLIER_YEAR_DATE, deadline: '2027-02-27T00:00:00.000Z' }
      ],
      [
        'a deadline on a day that does not exist',
        { ...EARLIER_YEAR_DATE, deadline: '2027-02-30' }
      ],
      [
        'a previous year row ID that is not numeric',
        { ...COMPLETE_ROW_LINK, previousYearRowId: '15a' }
      ]
    ]

    it.for(INVALID_MESSAGES)('should reject %s', ([, message]) => {
      const details = expectValidationError(
        summaryLogResponseSchema,
        responseWith(message)
      )

      expect(details).toHaveLength(1)
    })

    it('should leave the fields of other codes to their messages', () => {
      const { error } = summaryLogResponseSchema.validate(
        responseWith({ errorCode: 'FIELD_REQUIRED' })
      )

      expect(error).toBeUndefined()
    })
  })

  describe('processing-type', () => {
    // A validated response always pairs with loadsByReportingPeriod (required by
    // the sibling rule), so include it to isolate the processingType assertion.
    const validatedBase = {
      status: SUMMARY_LOG_STATUS.VALIDATED,
      year: 2026,
      ledgerAccreditation: REGISTERED_ONLY,
      loadsByReportingPeriod: emptyLoadsByReportingPeriod()
    }

    it('should require processing-type when status is validated', () => {
      const details = expectValidationError(
        summaryLogResponseSchema,
        validatedBase
      )

      expect(details).toStrictEqual([
        expect.objectContaining({
          type: 'any.required',
          path: ['processingType']
        })
      ])
    })

    it('should accept a validated response that includes processing-type', () => {
      const { error } = summaryLogResponseSchema.validate({
        ...validatedBase,
        processingType: 'EXPORTER'
      })

      expect(error).toBeUndefined()
    })

    it('should not require processing-type before validation', () => {
      const { error } = summaryLogResponseSchema.validate({
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        year: 2026,
        ledgerAccreditation: REGISTERED_ONLY
      })

      expect(error).toBeUndefined()
    })
  })
})
