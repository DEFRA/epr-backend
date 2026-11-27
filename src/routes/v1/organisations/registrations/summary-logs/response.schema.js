import Joi from 'joi'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { loadsSchema } from '#domain/summary-logs/loads-schema.js'
import { LEDGER_ACCREDITATION_KIND } from '#domain/organisations/model.js'
import { loadsByReportingPeriodSchema } from '#domain/summary-logs/loads-by-period-status-schema.js'
import { ISSUE_KIND } from '#common/validation/validation-issue-kinds.js'
import { VALIDATION_CODE } from '#common/enums/validation.js'
import { isoDateString } from '#common/validation/iso-date-schema.js'
import { yearSchema } from '#common/validation/year-schema.js'

/** @import {IssueKind} from '#common/validation/validation-issue-kinds.js' */

const countSchema = Joi.number().integer().min(0).required()

const requiredYearSchema = yearSchema().required()

const previousYearRowIdSchema = Joi.string()
  .pattern(/^\d+$/, 'numeric')
  .required()

/**
 * The fields each cell message fills in, which every failure of that code
 * carries.
 */
const CELL_MESSAGE_FIELDS = Object.freeze({
  [VALIDATION_CODE.DATE_AFTER_SUMMARY_LOG_YEAR]: {
    expected: requiredYearSchema
  },
  [VALIDATION_CODE.DATE_BEFORE_SUMMARY_LOG_YEAR]: {
    deadline: isoDateString().required(),
    expected: requiredYearSchema
  },
  [VALIDATION_CODE.PREVIOUS_YEAR_ROW_NOT_FOUND]: {
    expected: requiredYearSchema
  },
  [VALIDATION_CODE.PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR]: {
    expected: requiredYearSchema,
    previousYearRowId: previousYearRowIdSchema
  },
  [VALIDATION_CODE.PREVIOUS_YEAR_ROW_REPATRIATED]: {
    expected: requiredYearSchema,
    previousYearRowId: previousYearRowIdSchema
  },
  [VALIDATION_CODE.PREVIOUS_YEAR_ROW_VALUE_DIFFERS]: {
    deadline: isoDateString().required(),
    expected: requiredYearSchema,
    previousYearRowId: previousYearRowIdSchema
  }
})

/**
 * Requires the fields a cell message fills in, by its error code.
 *
 * @param {Joi.ObjectSchema} schema
 * @returns {Joi.ObjectSchema}
 */
const withCellMessageFields = (schema) =>
  schema.when('.errorCode', {
    switch: Object.entries(CELL_MESSAGE_FIELDS).map(([errorCode, fields]) => ({
      is: errorCode,
      then: Joi.object(fields)
    }))
  })

const issueFields = {
  actual: Joi.any().optional(),
  /** @deprecated Use errorCode for specific validation codes */
  code: Joi.string().required(),
  errorCode: Joi.string().required(),
  expected: Joi.any().optional()
}

const cellMessageFields = {
  deadline: isoDateString().optional(),
  previousYearRowId: Joi.string().optional()
}

/**
 * What each kind of failure carries beyond its code, by where it is.
 *
 * @type {Readonly<Record<IssueKind, Joi.ObjectSchema>>}
 */
const FAILURE_SCHEMAS = Object.freeze({
  file: Joi.object(),
  meta: Joi.object({
    location: Joi.object({
      column: Joi.string(),
      field: Joi.string().required(),
      row: Joi.number(),
      sheet: Joi.string()
    })
      .and('column', 'row', 'sheet')
      .required()
  }),
  table: Joi.object({
    location: Joi.object({
      sheet: Joi.string().required(),
      table: Joi.string().required()
    }).required()
  }),
  removedRow: Joi.object({
    location: Joi.object({
      rowId: Joi.string().required(),
      sheet: Joi.string().required(),
      table: Joi.string().required()
    }).required()
  }),
  cell: withCellMessageFields(
    Joi.object({
      ...cellMessageFields,
      location: Joi.object({
        column: Joi.string().required(),
        header: Joi.string().required(),
        row: Joi.number().required(),
        rowId: Joi.string().optional(),
        sheet: Joi.string().required(),
        table: Joi.string().required()
      }).required()
    })
  )
})

/** A fatal issue, where its kind says it is. */
const validationFailureSchema = Joi.alternatives().conditional('.kind', {
  switch: Object.entries(FAILURE_SCHEMAS).map(([kind, schema]) => ({
    is: kind,
    then: schema.keys({ ...issueFields, kind: Joi.valid(kind).required() })
  })),
  otherwise: Joi.object({
    kind: Joi.string()
      .valid(...Object.values(ISSUE_KIND))
      .required()
  }).unknown()
})

/** A non-fatal issue at a cell of a row. */
const validationConcernSchema = withCellMessageFields(
  Joi.object({
    ...issueFields,
    ...cellMessageFields,
    column: Joi.string().required(),
    header: Joi.string().required(),
    type: Joi.string().valid('error', 'warning').required()
  })
)

const validationConcernsSchema = Joi.object().pattern(
  Joi.string(),
  Joi.object({
    sheet: Joi.string().required(),
    rows: Joi.array()
      .items(
        Joi.object({
          row: Joi.number().required(),
          issues: Joi.array().items(validationConcernSchema).required()
        })
      )
      .required()
  })
)

export const summaryLogResponseSchema = Joi.object({
  status: Joi.string()
    .valid(
      SUMMARY_LOG_STATUS.PREPROCESSING,
      SUMMARY_LOG_STATUS.REJECTED,
      SUMMARY_LOG_STATUS.VALIDATING,
      SUMMARY_LOG_STATUS.INVALID,
      SUMMARY_LOG_STATUS.VALIDATED,
      SUMMARY_LOG_STATUS.SUBMITTING,
      SUMMARY_LOG_STATUS.SUBMITTED,
      SUMMARY_LOG_STATUS.SUPERSEDED,
      SUMMARY_LOG_STATUS.VALIDATION_FAILED,
      SUMMARY_LOG_STATUS.SUBMISSION_FAILED
    )
    .required(),
  validation: Joi.object({
    failures: Joi.array().items(validationFailureSchema).required(),
    concerns: validationConcernsSchema.required(),
    counts: Joi.object({
      fatal: countSchema,
      error: countSchema,
      warning: countSchema,
      total: countSchema
    }).required()
  }).optional(),
  loads: loadsSchema.optional(),
  loadsByReportingPeriod: Joi.when('status', {
    is: Joi.valid(SUMMARY_LOG_STATUS.VALIDATED, SUMMARY_LOG_STATUS.SUBMITTED),
    then: loadsByReportingPeriodSchema.required(),
    otherwise: loadsByReportingPeriodSchema.optional()
  }),
  processingType: Joi.when('status', {
    is: SUMMARY_LOG_STATUS.VALIDATED,
    then: Joi.string().required(),
    otherwise: Joi.string().optional()
  }),
  material: Joi.string().optional(),
  accreditationNumber: Joi.string().optional(),
  year: Joi.number().integer().required(),
  ledgerAccreditation: Joi.alternatives()
    .try(
      Joi.object({
        kind: Joi.string()
          .valid(LEDGER_ACCREDITATION_KIND.ACCREDITED)
          .required(),
        accreditationNumber: Joi.string().required()
      }),
      Joi.object({
        kind: Joi.string()
          .valid(LEDGER_ACCREDITATION_KIND.REGISTERED_ONLY)
          .required()
      })
    )
    .required()
})

const statusOnlyResponseSchema = (status) =>
  Joi.object({ status: Joi.string().valid(status).required() })

const placeholderResponseSchema = statusOnlyResponseSchema(
  SUMMARY_LOG_STATUS.PREPROCESSING
)

export const summaryLogGetResponseSchema = Joi.alternatives().conditional(
  placeholderResponseSchema,
  { then: placeholderResponseSchema, otherwise: summaryLogResponseSchema }
)

export const summaryLogSubmitResponseSchema = statusOnlyResponseSchema(
  SUMMARY_LOG_STATUS.SUBMITTING
)
