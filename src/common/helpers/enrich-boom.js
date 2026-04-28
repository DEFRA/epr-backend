import Boom from '@hapi/boom'

/**
 * @import { Boom as BoomError } from '@hapi/boom'
 * @import { EnrichedBoom, BoomEvent } from '#common/types/enriched-boom.js'
 *
 * @typedef {{ event: BoomEvent, payload?: Record<string, unknown> }} BoomEnrichment
 */

/**
 * Attaches CDP-indexed log enrichment fields (`code` + `event`) to a Boom
 * error and optionally merges `payload` into the response body. Mutates and
 * returns the boom so call sites read as
 * `throw enrichBoom(Boom.X('msg'), 'code', { event, payload })`.
 *
 * @param {BoomError} boom
 * @param {string} code
 * @param {BoomEnrichment} enrichment
 * @returns {EnrichedBoom}
 */
export const enrichBoom = (boom, code, { event, payload }) => {
  const enriched = /** @type {EnrichedBoom} */ (boom)
  enriched.code = code
  enriched.event = event
  if (payload) {
    enriched.output.payload = { ...enriched.output.payload, ...payload }
  }
  return enriched
}

/**
 * Builds a 400 Boom enriched with CDP-indexed `code` and `event` fields.
 *
 * @param {string} message
 * @param {string} code
 * @param {BoomEnrichment} enrichment
 */
export const badRequest = (message, code, enrichment) =>
  enrichBoom(Boom.badRequest(message), code, enrichment)

/**
 * Builds a 409 Boom enriched with CDP-indexed `code` and `event` fields.
 *
 * @param {string} message
 * @param {string} code
 * @param {BoomEnrichment} enrichment
 */
export const conflict = (message, code, enrichment) =>
  enrichBoom(Boom.conflict(message), code, enrichment)

/**
 * Builds a 500 Boom enriched with CDP-indexed `code` and `event` fields.
 *
 * @param {string} message
 * @param {string} code
 * @param {BoomEnrichment} enrichment
 */
export const internal = (message, code, enrichment) =>
  enrichBoom(Boom.internal(message), code, enrichment)
