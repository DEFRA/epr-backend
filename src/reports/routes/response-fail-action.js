import { internal } from '#common/helpers/logging/cdp-boom.js'
import { LOGGING_EVENT_ACTIONS } from '#common/enums/event.js'

/**
 * @import { ValidationError } from 'joi'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 */

const MAX_LOGGED_VIOLATIONS = 5

/**
 * Summarises a Joi validation error into PII-safe descriptors: the failing
 * field path and the rule type it broke, never the offending value.
 *
 * @param {ValidationError} err
 * @returns {string}
 */
const summariseViolations = (err) =>
  err.details
    .slice(0, MAX_LOGGED_VIOLATIONS)
    .map((detail) => `${detail.path.join('.')}:${detail.type}`)
    .join(' ')

/**
 * Response-validation failAction for the report routes. Hapi's built-in
 * `'error'` mode surfaces only the first Joi message, dropping the report
 * identity and the failing field — leaving a bare `"stale.uploadedAt" is not
 * allowed` in the logs (PAE-1755). This throws a CdpBoom enriched with a
 * searchable `code` and `event`, so `boom-error-logger` indexes which report
 * failed and where.
 *
 * PII-safe: logs the route params (resource identifiers, already present in
 * `url.path`) and the Joi field-paths + rule types, never the offending values.
 *
 * @param {HapiRequest} request
 * @param {HapiResponseToolkit} _h
 * @param {ValidationError} err
 * @returns {never}
 */
export const reportResponseFailAction = (request, _h, err) => {
  const violations = summariseViolations(err)
  throw internal(err.message, 'report_response_schema_violation', {
    event: {
      action: LOGGING_EVENT_ACTIONS.REPORT_RESPONSE_SCHEMA_VIOLATION,
      reason: `params=${JSON.stringify(request.params)} violations=${violations}`
    }
  })
}
