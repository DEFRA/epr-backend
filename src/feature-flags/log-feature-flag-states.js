import { LOGGING_EVENT_CATEGORIES } from '#common/enums/event.js'

/**
 * Logs the configured state of every feature flag so operators can check
 * which flags are active in a given environment.
 *
 * @param {{ get: (key: string) => unknown }} config
 * @param {{ info: (obj: object) => void }} logger
 */
export const logFeatureFlagStates = (config, logger) => {
  const flags = /** @type {Record<string, unknown>} */ (
    config.get('featureFlags')
  )
  const formatted = Object.entries(flags)
    .map(([name, value]) => `${name}=${value}`)
    .join(' ')

  logger.info({
    message: `Feature flags: ${formatted}`,
    event: { category: LOGGING_EVENT_CATEGORIES.CONFIG }
  })
}
