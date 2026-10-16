import { createSummaryLogsRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '#root/config.js'

/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

const SIXTY_SECONDS = 60

// Per-request instantiation: needs request.logger for update conflict logging.
export const mongoSummaryLogsRepositoryPlugin = {
  name: 'summaryLogsRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'organisationsRepository'],

  register: async (server) => {
    const organisationsRepository = /** @type {OrganisationsRepository} */ (
      server.app.organisationsRepository
    )
    const s3Client = createS3Client({
      region: config.get('awsRegion'),
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: config.get('isDevelopment')
    })

    const factory = await createSummaryLogsRepository(
      server.db,
      { s3Client, preSignedUrlExpiry: SIXTY_SECONDS },
      organisationsRepository
    )

    registerDependency(server, 'summaryLogsRepository', (request) =>
      factory(request.logger)
    )
  }
}
