import {
  closeWorkerPool,
  createSummaryLogsCommandExecutor
} from '#adapters/validators/summary-logs/piscina.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'

export const workers = {
  plugin: {
    name: 'workers',
    version: '1.0.0',
    register: (server, options) => {
      // If test provides a mock worker, use it directly
      if (options?.summaryLogsWorker) {
        server.decorate(
          'request',
          'summaryLogsWorker',
          () => options.summaryLogsWorker,
          { apply: true }
        )
        return
      }

      // If test provides a repository, use it directly (for in-memory tests)
      if (options?.summaryLogsRepository) {
        const summaryLogsWorker = createSummaryLogsCommandExecutor(
          server.logger,
          options.summaryLogsRepository
        )

        server.decorate(
          'request',
          'summaryLogsWorker',
          () => summaryLogsWorker,
          { apply: true }
        )
      } else {
        // Production: wait for mongodb to be available, then create worker with repository
        server.dependency('mongodb', async () => {
          const summaryLogsRepository = (
            await createSummaryLogsRepository(server.db)
          )(server.logger)
          const summaryLogsWorker = createSummaryLogsCommandExecutor(
            server.logger,
            summaryLogsRepository
          )

          server.decorate(
            'request',
            'summaryLogsWorker',
            () => summaryLogsWorker,
            { apply: true }
          )
        })
      }

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
        } catch (err) {
          /* v8 ignore next 9 */
          server.logger.error({
            error: err,
            message: 'Failed to close worker pool',
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_FAILURE
            }
          })
        }
      })
    }
  }
}
