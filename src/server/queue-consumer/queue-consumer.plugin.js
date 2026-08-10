import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSqsClient } from '#common/helpers/sqs/sqs-client.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createOnSummaryLogUploaded } from '#reports/application/summary-log-events.js'
import { createReportsService } from '#reports/application/report-service.js'
import { createCommandQueueConsumer } from './consumer.js'
import { summaryLogCommandHandlers } from './summary-log-commands.js'
import { orsImportCommandHandlers } from './ors-import-commands.js'

/** @import { Consumer } from 'sqs-consumer' */

/**
 * @typedef {Object} CommandQueueConsumerPluginOptions
 * @property {{get: (key: string) => string}} config
 */

/**
 * Builds the base consumer dependencies from server app and config.
 * @param {import('#common/hapi-types.js').HapiServer} server
 * @param {CommandQueueConsumerPluginOptions} options
 */
function buildConsumerDeps(server, { config }) {
  const sqsClient = createSqsClient({
    region: config.get('awsRegion'),
    endpoint: config.get('commandQueue.endpoint')
  })

  const {
    uploadsRepository,
    summaryLogsRepository,
    organisationsRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    wasteBalanceService,
    reportsRepository,
    systemLogsRepository
  } = server.app

  const onSummaryLogUploaded = createOnSummaryLogUploaded({
    reportsRepository,
    systemLogsRepository
  })

  return {
    sqsClient,
    queueName: config.get('commandQueue.queueName'),
    uploadsRepository,
    summaryLogsRepository,
    organisationsRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    wasteBalanceService,
    reportsService: createReportsService(reportsRepository),
    summaryLogExtractor: createSummaryLogExtractor({ uploadsRepository }),
    onSummaryLogUploaded
  }
}

export const commandQueueConsumerPlugin = {
  name: 'command-queue-consumer',
  version: '1.0.0',
  dependencies: [
    'summaryLogsRepository',
    'organisationsRepository',
    'wasteBalanceService',
    'uploadsRepository',
    'reportsRepository',
    'systemLogsRepository'
  ],

  register: async (
    /** @type {import('#common/hapi-types.js').HapiServer} */ server,
    /** @type {CommandQueueConsumerPluginOptions} */ options
  ) => {
    const { sqsClient, queueName, uploadsRepository, ...baseDeps } =
      buildConsumerDeps(server, options)
    /** @type {Consumer | null} */
    let consumer = null

    server.events.on('start', async () => {
      server.logger.info({
        message: `Starting SQS command queue consumer for queue: ${queueName}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })

      const orsExtras = server.app.orsImportsRepository
        ? {
            orsImportsRepository: server.app.orsImportsRepository,
            overseasSitesRepository: server.app.overseasSitesRepository,
            uploadsRepository,
            systemLogsRepository: server.app.systemLogsRepository
          }
        : {}

      const deps = {
        sqsClient,
        queueName,
        logger: server.logger,
        ...baseDeps,
        ...orsExtras
      }
      const handlers = server.app.orsImportsRepository
        ? [...summaryLogCommandHandlers, ...orsImportCommandHandlers]
        : [...summaryLogCommandHandlers]

      consumer = await createCommandQueueConsumer(deps, handlers)
      consumer.start()
    })

    server.events.on('stop', async () => {
      server.logger.info({
        message: 'Stopping SQS command queue consumer',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
        }
      })

      if (consumer) {
        consumer.stop()
      }
      sqsClient.destroy()

      server.logger.info({
        message: 'SQS command queue consumer stopped',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_SUCCESS
        }
      })
    })
  }
}
