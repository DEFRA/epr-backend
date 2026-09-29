import { bootstrap } from 'global-agent'

import { config } from '#root/config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../enums/event.js'
import { logger } from '../logging/logger.js'

/**
 * If HTTP_PROXY is set setupProxy() will enable it globally
 * for clients built on Node's http and https modules, such as Wreck and the
 * AWS SDK. global-agent ignores NO_PROXY, so these always use the proxy.
 * Node's built-in fetch is proxied by Node itself, through NODE_USE_ENV_PROXY,
 * HTTPS_PROXY and NO_PROXY.
 */
export function setupProxy() {
  const proxyUrl = config.get('httpProxy')

  if (proxyUrl) {
    logger.info({
      message: 'Setting up global proxy',
      event: {
        category: LOGGING_EVENT_CATEGORIES.PROXY,
        action: LOGGING_EVENT_ACTIONS.PROXY_INITIALISING
      }
    })

    // global-agent (Wreck, axios, request and others)
    bootstrap()
    global.GLOBAL_AGENT.HTTP_PROXY = proxyUrl
  }
}
