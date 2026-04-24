import Boom from '@hapi/boom'
import { CADENCE } from '#reports/domain/cadence.js'

/** @import { Cadence } from '#reports/domain/cadence.js' */

/**
 * Throws a 400 Boom with `output.payload.cadence = { actual, expected }`
 * if the submitted cadence does not match what the registration type requires.
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
    const boom = Boom.badRequest(
      `Cadence '${cadence}' does not match registration type — expected '${expected}'`
    )
    boom.output.payload.cadence = { actual: cadence, expected }
    throw boom
  }
}
