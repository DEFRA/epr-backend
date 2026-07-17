import { createOnPrnCancelled } from '#reports/application/prn-cancellation-events.js'
import { registerDependency } from '#plugins/register-dependency.js'

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 * @import { PrnCancelledParams } from '#reports/application/prn-cancellation-events.js'
 */

/**
 * @typedef {(params: PrnCancelledParams) => Promise<void>} OnPrnCancelledHandler
 */

/**
 * Generic PRN lifecycle event plugin: exposes `request.prnEvents` so any
 * route can notify interested domains of a PRN transition without knowing
 * who's listening. Each event fans out to every registered handler, so a
 * new consumer is added by appending a handler factory below rather than
 * editing the callers that raise the event.
 *
 * The cast below is needed because `registerDependency`'s `getInstance` type
 * only guarantees `{ logger }` — it's also called once at startup with no
 * real request to build an (unused) `server.app` variant.
 */
export const prnEventsPlugin = {
  name: 'prnEvents',
  version: '1.0.0',
  dependencies: ['reportsRepository', 'systemLogsRepository'],

  register: (server) => {
    registerDependency(server, 'prnEvents', (request) => {
      const { reportsRepository, systemLogsRepository, logger } =
        /** @type {{ reportsRepository: ReportsRepository, systemLogsRepository: SystemLogsRepository, logger: import('#common/hapi-types.js').TypedLogger }} */ (
          /** @type {unknown} */ (request)
        )

      /** @type {OnPrnCancelledHandler[]} */
      const onCancelledHandlers = [
        createOnPrnCancelled({ reportsRepository, systemLogsRepository })
      ]

      return {
        onCancelled: async (/** @type {PrnCancelledParams} */ params) => {
          const results = await Promise.allSettled(
            onCancelledHandlers.map((handler) => handler(params))
          )

          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              logger.error({
                err: result.reason,
                message: `prnEvents.onCancelled handler[${index}] failed for organisationId=${params.organisationId} registrationId=${params.registrationId} prnId=${params.prnId}`,
                event: { reference: params.prnId }
              })
            }
          })
        }
      }
    })
  }
}
