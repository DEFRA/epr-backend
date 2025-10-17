import { createMongoClient } from '#common/helpers/mongo-client.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'

import { config } from '../../../config.js'

import { summaryLogsValidatorWorker } from './worker.js'

export default async function summaryLogsValidatorWorkerThread({
  id,
  version,
  summaryLog
}) {
  const { mongoUrl, mongoOptions, databaseName } = config.get('mongo')

  const mongoClient = await createMongoClient({
    url: mongoUrl,
    options: mongoOptions
  })

  try {
    const db = mongoClient.db(databaseName)

    const summaryLogsRepository = createSummaryLogsRepository(db)(logger)

    await summaryLogsValidatorWorker({
      summaryLogsRepository,
      id,
      version,
      summaryLog
    })
  } finally {
    await mongoClient.close()
  }
}
