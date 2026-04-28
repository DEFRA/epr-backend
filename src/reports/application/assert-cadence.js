import Boom from '@hapi/boom'
import { CADENCE } from '#reports/domain/cadence.js'
import { errorCodes } from '#reports/enums/error-codes.js'

/**
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { EnrichedBoom } from '#common/types/enriched-boom.js'
 */

/**
 * Throws a 400 Boom when the submitted cadence does not match what the
 * registration type requires. The boom carries `code`, structured `event`
 * fields for indexed logging, and `output.payload.cadence` for API clients.
 *
 * @param {Cadence} cadence
 * @param {{ accreditationId?: string | null }} registration
 * @returns {void}
 */
export const assertCadence = (cadence, registration) => {
  const expected = registration.accreditationId
    ? CADENCE.monthly
    : CADENCE.quarterly

  if (cadence === expected) {
    return
  }

  const boom = /** @type {EnrichedBoom} */ (
    Boom.badRequest(
      `Cadence '${cadence}' does not match registration type — expected '${expected}'`
    )
  )
  boom.code = errorCodes.cadenceMismatch
  boom.event = {
    action: 'create_report',
    reason: `actual=${cadence} expected=${expected}`
  }
  boom.output.payload.cadence = { actual: cadence, expected }
  throw boom
}
