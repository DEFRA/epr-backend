import Boom from '@hapi/boom'

/**
 * @import { Boom as BoomError } from '@hapi/boom'
 * @import { CdpIndexedLog } from './cdp-log-types.js'
 *
 * @typedef {Pick<NonNullable<CdpIndexedLog['event']>, 'action' | 'reason' | 'reference'>} CdpBoomEvent
 * @typedef {BoomError & { code?: string, event?: CdpBoomEvent }} CdpBoom
 * @typedef {{ event: CdpBoomEvent, payload?: Record<string, unknown> }} CdpBoomEnrichment
 */

/**
 * Attaches CDP-indexed log enrichment fields (`code` + `event`) to a Boom
 * error and optionally merges `payload` into the response body. Mutates and
 * returns the boom so call sites read as
 * `throw badRequest('msg', 'code', { event, payload })`.
 *
 * @param {BoomError} boom
 * @param {string} code
 * @param {CdpBoomEnrichment} enrichment
 * @returns {CdpBoom}
 */
const enrich = (boom, code, { event, payload }) => {
  const enriched = /** @type {CdpBoom} */ (boom)
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
 * @param {CdpBoomEnrichment} enrichment
 */
export const badRequest = (message, code, enrichment) =>
  enrich(Boom.badRequest(message), code, enrichment)

/**
 * Builds a 409 Boom enriched with CDP-indexed `code` and `event` fields.
 *
 * @param {string} message
 * @param {string} code
 * @param {CdpBoomEnrichment} enrichment
 */
export const conflict = (message, code, enrichment) =>
  enrich(Boom.conflict(message), code, enrichment)

/**
 * Builds a 500 Boom enriched with CDP-indexed `code` and `event` fields.
 *
 * @param {string} message
 * @param {string} code
 * @param {CdpBoomEnrichment} enrichment
 */
export const internal = (message, code, enrichment) =>
  enrich(Boom.internal(message), code, enrichment)

/**
 * Composes the `type=… code=…` tail of an `event.reason` string from an
 * underlying error. Falls back to `Error` / `unknown` when fields are
 * missing so the tail keeps a fixed shape — easier to query in OpenSearch.
 *
 * @param {{ name?: string, code?: string | number } | null | undefined} error
 * @returns {string}
 */
export const classifierTail = (error) =>
  `type=${error?.name ?? 'Error'} code=${error?.code ?? 'unknown'}`
