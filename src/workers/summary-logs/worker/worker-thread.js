import { SummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { SummaryLogUpdater } from '#application/summary-logs/updater.js'
import { SummaryLogsValidator } from '#application/summary-logs/validator.js'
import { ExcelJSSummaryLogsParser } from '#adapters/parsers/summary-logs/exceljs-parser.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/s3.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createMongoClient } from '#common/helpers/mongo-client.js'
import { patchTlsSecureContext } from '#common/helpers/secure-context.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'

import { config } from '../../../config.js'

patchTlsSecureContext()

export default async function summaryLogsValidatorWorkerThread(summaryLogId) {
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
      const summaryLogsParser = new ExcelJSSummaryLogsParser()

      const summaryLogExtractor = new SummaryLogExtractor({
        uploadsRepository,
        summaryLogsParser
      })

      const summaryLogUpdater = new SummaryLogUpdater({
        summaryLogsRepository
      })

      const summaryLogsValidator = new SummaryLogsValidator({
        summaryLogsRepository,
        summaryLogExtractor,
        summaryLogUpdater
      })

      await summaryLogsValidator.validate(summaryLogId)
    } finally {
      s3Client.destroy()
    }
  } finally {
    await mongoClient.close()
  }
}
