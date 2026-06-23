import { describe, it, expect, vi } from 'vitest'
import { logFeatureFlagStates } from './log-feature-flag-states.js'

describe('logFeatureFlagStates', () => {
  it('logs every feature flag name and value on a single info line', () => {
    const config = {
      get: vi.fn().mockReturnValue({
        devEndpoints: false
      })
    }
    const loggerInfo = vi.fn()
    const logger =
      /** @type {import('#common/helpers/logging/logger.js').TypedLogger} */ (
        /** @type {unknown} */ ({
          info: loggerInfo
        })
      )

    logFeatureFlagStates(config, logger)

    expect(config.get).toHaveBeenCalledWith('featureFlags')
    expect(loggerInfo).toHaveBeenCalledTimes(1)
    const [logged] = loggerInfo.mock.calls[0]
    expect(logged.message).toBe('Feature flags: devEndpoints=false')
    expect(logged.event).toEqual({ category: 'configuration' })
  })

  it('handles an empty feature flag set', () => {
    const config = { get: vi.fn().mockReturnValue({}) }
    const loggerInfo = vi.fn()
    const logger =
      /** @type {import('#common/helpers/logging/logger.js').TypedLogger} */ (
        /** @type {unknown} */ ({
          info: loggerInfo
        })
      )

    logFeatureFlagStates(config, logger)

    const [logged] = loggerInfo.mock.calls[0]
    expect(logged.message).toBe('Feature flags: ')
  })
})
