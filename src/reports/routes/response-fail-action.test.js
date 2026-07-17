import Joi from 'joi'
import { describe, expect, it } from 'vitest'

import { reportResponseFailAction } from './response-fail-action.js'
import { LOGGING_EVENT_ACTIONS } from '#common/enums/event.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 */

const buildRequest = (params = {}) =>
  /** @type {HapiRequest} */ (/** @type {unknown} */ ({ params }))

const h = /** @type {HapiResponseToolkit} */ (/** @type {unknown} */ ({}))

const buildValidationError = (schema, value) => {
  const { error } = schema.validate(value, { abortEarly: false })
  return error
}

describe('reportResponseFailAction', () => {
  it('throws a 500 boom carrying the original message, code, and full event', () => {
    const params = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      year: 2026,
      cadence: 'monthly',
      period: 4,
      submissionNumber: 1
    }
    const error = buildValidationError(
      Joi.object({ summaryLogChanged: Joi.object() }),
      { uploadedAt: '2025-01-01T00:00:00.000Z' }
    )

    expect(() =>
      reportResponseFailAction(buildRequest(params), h, error)
    ).toThrow(
      expect.objectContaining({
        isBoom: true,
        message: '"uploadedAt" is not allowed',
        code: 'report_response_schema_violation',
        output: expect.objectContaining({ statusCode: 500 }),
        event: {
          action: LOGGING_EVENT_ACTIONS.REPORT_RESPONSE_SCHEMA_VIOLATION,
          reason: `params=${JSON.stringify(params)} violations=uploadedAt:object.unknown`
        }
      })
    )
  })
})
