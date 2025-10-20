import { S3Client } from '@aws-sdk/client-s3'

export function createS3Client({ region, endpoint, forcePathStyle }) {
  return new S3Client({
    region,
    endpoint,
    forcePathStyle
  })
}
