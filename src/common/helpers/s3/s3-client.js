import { S3Client } from '@aws-sdk/client-s3'

export function createS3Client({
  region,
  endpoint,
  forcePathStyle,
  credentials = undefined
}) {
  const config = {
    region,
    endpoint,
    forcePathStyle
  }

  if (credentials) {
    config.credentials = credentials
  }

  return new S3Client(config)
}
