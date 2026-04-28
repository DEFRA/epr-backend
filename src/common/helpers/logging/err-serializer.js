/**
 * @import { CdpIndexedLog } from './cdp-log-types.js'
 */

/**
 * Pino `err` serializer mirroring the transformation `@elastic/ecs-pino-format`
 * applies on its way to OpenSearch. Extracted from logger-options.js so the
 * return type can be constrained to `CdpIndexedLog['error']` — fields outside
 * the cdp allowlist surface as tsc errors instead of being silently dropped
 * at ingest.
 *
 * @param {unknown} err
 * @returns {NonNullable<CdpIndexedLog['error']> | unknown}
 */
export const errSerializer = (err) => {
  if (!(err instanceof Error)) {
    return err
  }

  /** @type {NonNullable<CdpIndexedLog['error']>} */
  const errorObj = {
    message: err.message,
    stack_trace: err.stack,
    type: err.name
  }

  // @ts-ignore - err.code is a convention on Error subclasses
  if (err.code) {
    // @ts-ignore
    errorObj.code = err.code
  }

  return errorObj
}
