import Piscina from 'piscina'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ONE_MINUTE = 60_000
const FIVE_MINUTES = 300_000

const pool = new Piscina({
  filename: path.join(__dirname, 'validate-worker-thread.js'),
  maxThreads: 4, // @todo: What should this be (based on CPU cores)?
  idleTimeout: ONE_MINUTE
})

export async function spawnValidationWorker({
  s3Bucket,
  s3Key,
  fileId,
  filename
}) {
  const s3Path = `${s3Bucket}/${s3Key}`

  try {
    const result = await pool.run(
      { s3Bucket, s3Key, fileId, filename },
      {
        timeout: FIVE_MINUTES
      }
    )

    logger.info({
      message: `Validation worker completed for [${fileId}] with name [${filename}] and path [${s3Path}]`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_SUCCESS
      }
    })

    return result
  } catch (err) {
    logger.error(err, {
      message: `Validation worker error for [${fileId}] with name [${filename}] and path [${s3Path}]`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      }
    })

    throw err
  }
}

export async function closeWorkerPool() {
  await pool.destroy()
}
