import { getConfig } from './config.js'

import { createServer } from '#server/server.js'
import { logger } from './common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from './common/enums/event.js'
import { enableAuditing } from '@defra/cdp-auditing'

async function startServer() {
  const config = getConfig()
  const auditConfig = config.get('audit')
  let server
  const auditingStatus = auditConfig.isEnabled ? 'on' : 'off'
  enableAuditing(auditConfig.isEnabled)

  try {
    server = await createServer()
    await server.start()

    server.logger.info({
      message: `Server started successfully at http://${config.get('host')}:${config.get('port')} with Auditing: ${auditingStatus}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })
  } catch (err) {
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
