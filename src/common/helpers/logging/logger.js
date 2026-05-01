import { pino } from 'pino'
import { loggerOptions } from './logger-options.js'

/**
 * @import { CdpIndexedLog } from './cdp-log-types.js'
 *
 * IndexedLogProperties is the developer-facing input shape: CdpIndexedLog plus
 * the `err` field that pino/ecs serialises into `error.*` before reaching
 * OpenSearch. The CDP type itself describes the on-the-wire shape and is
 * generated from the upstream allowlist.
 *
 * @typedef {CdpIndexedLog & { err?: Error }} IndexedLogProperties
 */

/**
 * @typedef {(obj: IndexedLogProperties) => void} LogMethod
 */

/**
 * @typedef {object} TypedLogger
 * @property {LogMethod} info
 * @property {LogMethod} error
 * @property {LogMethod} warn
 * @property {LogMethod} debug
 * @property {LogMethod} trace
 * @property {LogMethod} fatal
 * @property {(bindings: Record<string, unknown>) => TypedLogger} child
 */

/**
 * @type {TypedLogger}
 */
export const logger = pino(loggerOptions)
