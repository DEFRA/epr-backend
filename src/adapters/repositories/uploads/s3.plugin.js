import { createUploadsRepository } from './cdp-uploader.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '#root/config.js'
import { registerRepository } from '#plugins/register-repository.js'

export const s3UploadsRepositoryPlugin = {
  name: 'uploadsRepository',
  version: '1.0.0',

  register: (server) => {
    const s3Client = createS3Client({
      region: config.get('awsRegion'),
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: config.get('isDevelopment')
    })

    // Note: createUploadsRepository returns the repo directly, not a factory
    const repository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: config.get('cdpUploader.url'),
      s3Bucket: config.get('cdpUploader.s3Bucket')
    })

    registerRepository(server, 'uploadsRepository', () => repository)
  }
}
