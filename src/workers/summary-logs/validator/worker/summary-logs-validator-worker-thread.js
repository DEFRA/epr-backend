import { createSummaryLogsRepository } from '#repositories/summary-logs-repository.mongodb.js'
import { createMongoClient } from '#common/helpers/mongo-client.js'

import { config } from '../../../../config.js'

import { summaryLogsValidatorWorker } from './summary-logs-validator-worker.js'

export default async function ({ summaryLog }) {
  const { mongoUrl, mongoOptions, databaseName } = config.get('mongo')

  const mongoClient = await createMongoClient({
    url: mongoUrl,
    options: mongoOptions
  })

  try {
    const db = mongoClient.db(databaseName)

    const summaryLogsRepository = createSummaryLogsRepository(db)

    await summaryLogsValidatorWorker({ summaryLogsRepository, summaryLog })
  } finally {
    await mongoClient.close()
  }
}
