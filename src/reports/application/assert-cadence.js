import { badRequest } from '#common/helpers/logging/cdp-boom.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { errorCodes } from '#reports/enums/error-codes.js'

/**
 * @import { Cadence } from '#reports/domain/cadence.js'
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

  if (cadence !== expected) {
    throw badRequest(
      `Cadence '${cadence}' does not match registration type — expected '${expected}'`,
      errorCodes.cadenceMismatch,
      {
        event: {
          action: 'create_report',
          reason: `actual=${cadence} expected=${expected}`
        },
        payload: { cadence: { actual: cadence, expected } }
      }
    )
  }
}
