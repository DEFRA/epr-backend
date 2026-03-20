import { createSummaryLogFilesRepository } from './summary-log-files.js'
import { summaryLogFilesConfig } from './config.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '#root/config.js'
import { registerRepository } from '#plugins/register-repository.js'

export const s3SummaryLogFilesRepositoryPlugin = {
  name: 'summaryLogFilesRepository',
  version: '1.0.0',

  register: (server) => {
    const s3Client = createS3Client({
      region: config.get('awsRegion'),
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: config.get('isDevelopment')
    })

    const repository = createSummaryLogFilesRepository({
      s3Client,
      preSignedUrlExpiry: summaryLogFilesConfig.preSignedUrlExpiry
    })

    registerRepository(server, 'summaryLogFilesRepository', () => repository)
  }
}
