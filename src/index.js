import { setupGlobalErrorHandler } from './common/helpers/global-handlers.js'
import { startServer } from './start-server.js'

await startServer()
setupGlobalErrorHandler()
