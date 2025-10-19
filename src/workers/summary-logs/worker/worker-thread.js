import { logger } from '#common/helpers/logging/logger.js'
import { createMongoClient } from '#common/helpers/mongo-client.js'
import { patchTlsSecureContext } from '#common/helpers/secure-context.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createUploadsRepository } from '#repositories/uploads/s3.js'
import { config } from '../../../config.js'

import { summaryLogsValidatorWorker } from './worker.js'

patchTlsSecureContext()

export default async function summaryLogsValidatorWorkerThread({ summaryLog }) {
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

      await summaryLogsValidatorWorker({
        summaryLog,
        summaryLogsRepository,
        uploadsRepository
      })
    } finally {
      s3Client.destroy()
    }
  } finally {
    await mongoClient.close()
  }
}
