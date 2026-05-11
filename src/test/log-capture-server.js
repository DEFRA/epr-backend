import hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'

import { loggerOptions } from '#common/helpers/logging/logger-options.js'

/**
 * @import { Server } from '@hapi/hapi'
 */

/**
 * @typedef {{
 *   message?: string,
 *   ['log.level']?: string,
 *   ['service.name']?: string,
 *   ['@timestamp']?: string,
 *   trace?: { id?: string },
 *   url?: { path?: string, full?: string },
 *   http?: {
 *     request?: { id?: string, method?: string },
 *     response?: { status_code?: number, body?: { bytes?: number } }
 *   },
 *   error?: { type?: string, message?: string, stack_trace?: string, code?: string },
 *   event?: { category?: string, action?: string, kind?: string, outcome?: string }
 * }} LogLine
 * @typedef {object} LogCaptureServer
 * @property {Server} server - Hapi server with a capture stream attached to hapi-pino
 * @property {string[]} lines - Raw JSON log lines emitted by hapi-pino
 * @property {(predicate: (line: LogLine) => boolean) => LogLine | undefined} findLine - Locate a parsed log line by predicate
 */

/**
 * @returns {Promise<LogCaptureServer>}
 */
export const createLogCaptureServer = async () => {
  /** @type {string[]} */
  const lines = []
  const stream = { write: (/** @type {string} */ s) => lines.push(s) }
  const { transport: _transport, ...rest } = loggerOptions

  const server = hapi.server({ port: 0 })
  await server.register({
    plugin: hapiPino,
    options: { ...rest, enabled: true, level: 'trace', stream }
  })

  return {
    server,
    lines,
    findLine: (predicate) => lines.map((s) => JSON.parse(s)).find(predicate)
  }
}
