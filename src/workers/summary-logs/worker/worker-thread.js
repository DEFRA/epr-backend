import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/s3.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createMongoClient } from '#common/helpers/mongo-client.js'
import { patchTlsSecureContext } from '#common/helpers/secure-context.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'

import { config } from '../../../config.js'

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
  wasteRecordsRepository,
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

  // Sync waste records from summary log
  const sync = syncFromSummaryLog({
    extractor: summaryLogExtractor,
    wasteRecordRepository: wasteRecordsRepository
  })

  await sync(summaryLog)

  // Update status to SUBMITTED
  transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)

  await summaryLogsRepository.update(summaryLogId, version, {
    status: SUMMARY_LOG_STATUS.SUBMITTED
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
      const uploadsRepository = createUploadsRepository(s3Client)
      const organisationsRepository = createOrganisationsRepository(db)()
      const wasteRecordsRepository = createWasteRecordsRepository(db)()

      const summaryLogExtractor = createSummaryLogExtractor({
        uploadsRepository,
        logger
      })

      // Dispatch to appropriate handler based on command type
      switch (command.command) {
        case 'validate':
          await handleValidateCommand({
            summaryLogId: command.summaryLogId,
            summaryLogsRepository,
            organisationsRepository,
            wasteRecordsRepository,
            summaryLogExtractor
          })
          break

        case 'submit':
          await handleSubmitCommand({
            summaryLogId: command.summaryLogId,
            summaryLogsRepository,
            wasteRecordsRepository,
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
