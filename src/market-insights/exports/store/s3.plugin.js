import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { registerDependency } from '#plugins/register-dependency.js'
import { config } from '#root/config.js'
import { createS3MarketInsightsExportStore } from './s3.js'

export const s3MarketInsightsExportStorePlugin = {
  name: 'marketInsightsExportStore',
  version: '1.0.0',

  register: (server) => {
    const store = createS3MarketInsightsExportStore({
      s3Client: createS3Client({
        region: config.get('awsRegion'),
        endpoint: config.get('s3Endpoint'),
        forcePathStyle: config.get('isDevelopment')
      }),
      s3Bucket: config.get('marketInsightsExport.s3Bucket'),
      preSignedUrlExpiry: Number.parseInt(
        config.get('marketInsightsExport.preSignedUrlExpiry')
      )
    })

    registerDependency(server, 'marketInsightsExportStore', () => store)
  }
}
