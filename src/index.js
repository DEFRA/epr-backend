import process from 'node:process'
import { createLogger } from './common/helpers/logging/logger.js'
import { startServer } from './common/helpers/start-server.js'

console.log('ENV API KEY:', process.env.GOVUK_NOTIFY_API_KEY)

await startServer()

process.on('unhandledRejection', (error) => {
  const logger = createLogger()
  logger.info('Unhandled rejection')
  logger.error(error)
  process.exitCode = 1
})
