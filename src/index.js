import { setupGlobalErrorHandler } from './common/helpers/global-handlers.js'
import { logger } from './common/helpers/logging/logger.js'
import { startServer } from './start-server.js'

setupGlobalErrorHandler(logger)
await startServer()
