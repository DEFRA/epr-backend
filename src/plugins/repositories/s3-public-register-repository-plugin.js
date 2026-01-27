import { createPublicRegisterRepository } from '#adapters/repositories/public-register/public-register.js'
import { publicRegisterConfig } from '#adapters/repositories/public-register/config.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '#root/config.js'
import { registerRepository } from './register-repository.js'

/**
 * S3 public register repository adapter plugin for production.
 * Registers the public register repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const s3PublicRegisterRepositoryPlugin = {
  name: 'publicRegisterRepository',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   */
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
