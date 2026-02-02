import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createMongoClient } from '#common/helpers/mongo-client.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { patchTlsSecureContext } from '#common/helpers/secure-context.js'
import { SUMMARY_LOG_COMMAND } from '#domain/summary-logs/status.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'

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
  summaryLogExtractor,
  user
}) => {
  await submitSummaryLog(summaryLogId, {
    logger,
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    wasteBalancesRepository,
    summaryLogExtractor,
    user
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

      const wasteRecordsRepositoryFactory =
        await createWasteRecordsRepository(db)
      const wasteRecordsRepository = wasteRecordsRepositoryFactory()

      const systemLogsRepositoryFactory = await createSystemLogsRepository(db)
      const systemLogsRepository = systemLogsRepositoryFactory(logger)

      const wasteBalancesRepositoryFactory =
        await createWasteBalancesRepository(db, {
          organisationsRepository,
          systemLogsRepository
        })
      const wasteBalancesRepository = wasteBalancesRepositoryFactory()

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
            summaryLogExtractor,
            user: command.user
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
