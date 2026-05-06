import hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'

import { loggerOptions } from '#common/helpers/logging/logger-options.js'

/**
 * @import { Server } from '@hapi/hapi'
 */

/**
 * @typedef {Record<string, any>} LogLine
 *
 * @typedef {object} LogCaptureServer
 * @property {Server} server - Hapi server with a capture stream attached to hapi-pino
 * @property {string[]} lines - Raw JSON log lines emitted by hapi-pino
 * @property {(predicate: (line: LogLine) => boolean) => LogLine | undefined} findLine - Locate a parsed log line by predicate
 */

/**
 * @returns {Promise<LogCaptureServer>}
 */
export const createLogCaptureServer = async () => {
  const lines = []
  const stream = { write: (s) => lines.push(s) }
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
