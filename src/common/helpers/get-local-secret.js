import fs from 'fs'
import { createLogger } from './logging/logger.js'

export function getLocalSecret(name) {
  try {
    return fs.readFileSync(process.env[name], 'utf8').toString().trim()
  } catch (err) {
    const logger = createLogger()

    logger.error(
      `An error occurred while trying to read the secret: ${name}.\n${err}`
    )

    return null
  }
}
