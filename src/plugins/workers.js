import {
  closeWorkerPool,
  createSummaryLogsValidator
} from '#adapters/validators/summary-logs/piscina.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

export const workers = {
  plugin: {
    name: 'workers',
    version: '1.0.0',
    register: (server, options) => {
      const summaryLogsValidator =
        options?.summaryLogsValidator ??
        createSummaryLogsValidator(server.logger)

      server.decorate(
        'request',
        'summaryLogsValidator',
        () => summaryLogsValidator,
        {
          apply: true
        }
      )

      server.events.on('stop', async () => {
        server.logger.info({
          message: 'Closing worker pool',
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
          }
        })

        try {
          await closeWorkerPool()

          server.logger.info({
            message: 'Closed worker pool',
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_SUCCESS
            }
          })
          /* c8 ignore start */
        } catch (err) {
          server.logger.error({
            error: err,
            message: 'Failed to close worker pool',
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_FAILURE
            }
          })
          /* c8 ignore end */
        }
      })
    }
  }
}
