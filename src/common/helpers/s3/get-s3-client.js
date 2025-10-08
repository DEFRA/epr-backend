import { S3Client } from '@aws-sdk/client-s3'

import { config } from '../../../config.js'

let s3Client

export function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.get('awsRegion'),
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: config.get('isDevelopment')
    })
  }

  return s3Client
}
