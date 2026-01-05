import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { logger } from '#common/helpers/logging/logger.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'
import { createMongoClient } from '#common/helpers/mongo-client.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { patchTlsSecureContext } from '#common/helpers/secure-context.js'
import {
  SUMMARY_LOG_COMMAND,
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

patchTlsSecureContext()

const handleValidateCommand = async ({
  summaryLogId,
  summaryLogsRepository,
  organisationsRepository,
  wasteRecordsRepository,
  summaryLogExtractor
}) => {
  const validateSummaryLog = createSummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogExtractor
  })

  await validateSummaryLog(summaryLogId)
}

const handleSubmitCommand = async ({
  summaryLogId,
  summaryLogsRepository,
  organisationsRepository,
  wasteRecordsRepository,
  wasteBalancesRepository,
  summaryLogExtractor
}) => {
  // Load the summary log
  const existing = await summaryLogsRepository.findById(summaryLogId)

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
    extractor: summaryLogExtractor,
    wasteRecordRepository: wasteRecordsRepository,
    wasteBalancesRepository,
    organisationsRepository,
    featureFlags
  })

  const { created, updated } = await summaryLogMetrics.timedSubmission(
    { processingType },
    () => sync(summaryLog)
  )

  // Record submission metrics
  await summaryLogMetrics.recordWasteRecordsCreated({ processingType }, created)
  await summaryLogMetrics.recordWasteRecordsUpdated({ processingType }, updated)

  // Update status to SUBMITTED
  await summaryLogsRepository.update(
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
}

export default async function summaryLogsWorkerThread(command) {
  const { mongoUrl, mongoOptions, databaseName } = config.get('mongo')

  const awsRegion = config.get('awsRegion')
  const s3Endpoint = config.get('s3Endpoint')
  const isDevelopment = config.get('isDevelopment')

  const mongoClient = await createMongoClient({
    url: mongoUrl,
    options: mongoOptions
  })

  try {
    const s3Client = createS3Client({
      region: awsRegion,
      endpoint: s3Endpoint,
      forcePathStyle: isDevelopment
    })

    try {
      const db = mongoClient.db(databaseName)

      const summaryLogsRepository = createSummaryLogsRepository(db)(logger)
      const uploadsRepository = createUploadsRepository({
        s3Client,
        cdpUploaderUrl: config.get('cdpUploader.url'),
        s3Bucket: config.get('cdpUploader.s3Bucket')
      })
      const organisationsRepository = createOrganisationsRepository(db)()
      const wasteRecordsRepository = createWasteRecordsRepository(db)()
      const wasteBalancesRepository = createWasteBalancesRepository(db, {
        organisationsRepository
      })()

      const summaryLogExtractor = createSummaryLogExtractor({
        uploadsRepository,
        logger
      })

      // Dispatch to appropriate handler based on command type
      switch (command.command) {
        case SUMMARY_LOG_COMMAND.VALIDATE:
          await handleValidateCommand({
            summaryLogId: command.summaryLogId,
            summaryLogsRepository,
            organisationsRepository,
            wasteRecordsRepository,
            summaryLogExtractor
          })
          break

        case SUMMARY_LOG_COMMAND.SUBMIT:
          await handleSubmitCommand({
            summaryLogId: command.summaryLogId,
            summaryLogsRepository,
            organisationsRepository,
            wasteRecordsRepository,
            wasteBalancesRepository,
            summaryLogExtractor
          })
          break

        default:
          throw new Error(`Unknown command: ${command.command}`)
      }
    } finally {
      s3Client.destroy()
    }
  } finally {
    await mongoClient.close()
  }
}
