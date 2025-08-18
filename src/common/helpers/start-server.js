import { config } from '../../config.js'

import { createServer } from '../../server.js'
import { createLogger } from './logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/event.js'
import { enableAuditing } from '@defra/cdp-auditing'

async function startServer() {
  let server

  enableAuditing(process.env.AUDIT_ENABLED !== 'false')

  try {
    server = await createServer()
    await server.start()

    server.logger.info({
      message: `Server started successfully at http://localhost:${config.get('port')}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })
  } catch (err) {
    const logger = createLogger()
    logger.error(err, {
      message: 'Server failed to start',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_FAILURE
      }
    })
  }

  return server
}

export { startServer }
