import { createSummaryLogsRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '#root/config.js'

const SIXTY_SECONDS = 60

// Per-request instantiation: needs request.logger for update conflict logging.
export const mongoSummaryLogsRepositoryPlugin = {
  name: 'summaryLogsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const s3Client = createS3Client({
      region: config.get('awsRegion'),
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: config.get('isDevelopment')
    })

    const factory = await createSummaryLogsRepository(server.db, {
      s3Client,
      preSignedUrlExpiry: SIXTY_SECONDS
    })

    registerRepository(server, 'summaryLogsRepository', (request) =>
      factory(request.logger)
    )
  }
}
