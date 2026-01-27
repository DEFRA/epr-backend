import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'
import { createMongoClient } from '#common/helpers/mongo-client.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createConfigFeatureFlags } from '#feature-flags/feature-flags.config.js'

import { config } from '#root/config.js'

/**
 * Creates command handlers for the queue consumer.
 * Each handler manages its own database and S3 connections.
 *
 * @param {object} options
 * @param {object} options.logger - Pino logger instance
 * @returns {object} Object with handleValidateCommand and handleSubmitCommand functions
 */
export function createCommandHandlers({ logger }) {
  /**
   * Creates the dependencies needed for command processing.
   * Returns a cleanup function to close connections.
   */
  const createDependencies = async () => {
    const { mongoUrl, mongoOptions, databaseName } = config.get('mongo')
    const awsRegion = config.get('awsRegion')
    const s3Endpoint = config.get('s3Endpoint')
    const isDevelopment = config.get('isDevelopment')

    const mongoClient = await createMongoClient({
      url: mongoUrl,
      options: mongoOptions
    })

    const s3Client = createS3Client({
      region: awsRegion,
      endpoint: s3Endpoint,
      forcePathStyle: isDevelopment
    })

    const db = mongoClient.db(databaseName)

    const summaryLogsRepositoryFactory = await createSummaryLogsRepository(db)
    const summaryLogsRepository = summaryLogsRepositoryFactory(logger)

    const uploadsRepository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: config.get('cdpUploader.url'),
      s3Bucket: config.get('cdpUploader.s3Bucket')
    })

    const organisationsRepositoryFactory =
      await createOrganisationsRepository(db)
    const organisationsRepository = organisationsRepositoryFactory()

    const wasteRecordsRepositoryFactory = await createWasteRecordsRepository(db)
    const wasteRecordsRepository = wasteRecordsRepositoryFactory()

    const wasteBalancesRepositoryFactory = await createWasteBalancesRepository(
      db,
      { organisationsRepository }
    )
    const wasteBalancesRepository = wasteBalancesRepositoryFactory()

    const summaryLogExtractor = createSummaryLogExtractor({
      uploadsRepository,
      logger
    })

    const cleanup = async () => {
      s3Client.destroy()
      await mongoClient.close()
    }

    return {
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository,
      summaryLogExtractor,
      cleanup
    }
  }

  const handleValidateCommand = async ({ summaryLogId }) => {
    const deps = await createDependencies()

    try {
      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: deps.summaryLogsRepository,
        organisationsRepository: deps.organisationsRepository,
        wasteRecordsRepository: deps.wasteRecordsRepository,
        summaryLogExtractor: deps.summaryLogExtractor
      })

      await validateSummaryLog(summaryLogId)
    } finally {
      await deps.cleanup()
    }
  }

  const handleSubmitCommand = async ({ summaryLogId }) => {
    const deps = await createDependencies()

    try {
      // Load the summary log
      const existing = await deps.summaryLogsRepository.findById(summaryLogId)

      if (!existing) {
        throw new Error(`Summary log ${summaryLogId} not found`)
      }

      const { version, summaryLog } = existing

      // Verify status is SUBMITTING
      if (summaryLog.status !== SUMMARY_LOG_STATUS.SUBMITTING) {
        throw new Error(
          `Summary log must be in submitting status. Current status: ${summaryLog.status}`
        )
      }

      const processingType =
        summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]

      // Sync waste records from summary log
      const featureFlags = createConfigFeatureFlags(config)
      const sync = syncFromSummaryLog({
        extractor: deps.summaryLogExtractor,
        wasteRecordRepository: deps.wasteRecordsRepository,
        wasteBalancesRepository: deps.wasteBalancesRepository,
        organisationsRepository: deps.organisationsRepository,
        featureFlags
      })

      const { created, updated } = await summaryLogMetrics.timedSubmission(
        { processingType },
        () => sync(summaryLog)
      )

      // Record submission metrics
      await summaryLogMetrics.recordWasteRecordsCreated(
        { processingType },
        created
      )
      await summaryLogMetrics.recordWasteRecordsUpdated(
        { processingType },
        updated
      )

      // Update status to SUBMITTED
      await deps.summaryLogsRepository.update(
        summaryLogId,
        version,
        transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
      )

      await summaryLogMetrics.recordStatusTransition({
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        processingType
      })

      logger.info({
        message: `Summary log submitted: summaryLogId=${summaryLogId}`
      })
    } finally {
      await deps.cleanup()
    }
  }

  return {
    handleValidateCommand,
    handleSubmitCommand
  }
}
