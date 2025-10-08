import { GetObjectCommand } from '@aws-sdk/client-s3'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../enums/index.js'
import { logger } from '../logging/logger.js'

import { getS3Client } from './get-s3-client.js'

export async function getS3File({ s3Bucket, s3Key }) {
  try {
    const s3Client = getS3Client()

    const command = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key
    })

    const response = await s3Client.send(command)

    const buffer = await response.Body.transformToByteArray()

    return Buffer.from(buffer)
  } catch (err) {
    logger.error(err, {
      message: `Failed to fetch file from S3: ${s3Bucket}/${s3Key}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE
      }
    })
    throw err
  }
}
