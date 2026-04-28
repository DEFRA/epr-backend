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
 * @typedef {object} TypedLogger
 * @property {(obj: IndexedLogProperties, msg?: string, ...args: any[]) => void} info
 * @property {(obj: IndexedLogProperties, msg?: string, ...args: any[]) => void} error
 * @property {(obj: IndexedLogProperties, msg?: string, ...args: any[]) => void} warn
 * @property {(obj: IndexedLogProperties, msg?: string, ...args: any[]) => void} debug
 * @property {(obj: IndexedLogProperties, msg?: string, ...args: any[]) => void} trace
 * @property {(obj: IndexedLogProperties, msg?: string, ...args: any[]) => void} fatal
 * @property {(bindings: Record<string, unknown>) => TypedLogger} child
 */

/**
 * @type {TypedLogger}
 */
export const logger = pino(loggerOptions)
