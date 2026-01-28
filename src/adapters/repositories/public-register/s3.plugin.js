import { createPublicRegisterRepository } from './public-register.js'
import { publicRegisterConfig } from './config.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '#root/config.js'
import { registerRepository } from '#plugins/register-repository.js'

export const s3PublicRegisterRepositoryPlugin = {
  name: 'publicRegisterRepository',
  version: '1.0.0',

  register: (server) => {
    const s3Client = createS3Client({
      region: config.get('awsRegion'),
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: config.get('isDevelopment')
    })

    // Note: createPublicRegisterRepository returns the repo directly, not a factory
    const repository = createPublicRegisterRepository({
      s3Client,
      s3Bucket: publicRegisterConfig.s3Bucket,
      preSignedUrlExpiry: publicRegisterConfig.preSignedUrlExpiry
    })

    registerRepository(server, 'publicRegisterRepository', () => repository)
  }
}
