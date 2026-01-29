import { enableAuditing } from '@defra/cdp-auditing'

import { createServer } from '#server/server.js'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { logger } from '#common/helpers/logging/logger.js'
import { validateConfig } from '#common/helpers/validate-config.js'

import { getConfig } from '#root/config.js'

async function startServer() {
  const config = getConfig()

  // We want the server to break early if the configuration is invalid
  validateConfig(config)
  const auditConfig = config.get('audit')
  const auditingStatus = auditConfig.isEnabled ? 'on' : 'off'
  enableAuditing(auditConfig.isEnabled)

  try {
    const server = await createServer()
    await server.start()

    server.logger.info({
      message: `Server started successfully at http://${config.get('host')}:${config.get('port')} with Auditing: ${auditingStatus}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    return server
  } catch (error) {
    logger.error({
      err: error,
      message: 'Server failed to start',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_FAILURE
      }
    })

    throw error
  }
}

export { startServer }
