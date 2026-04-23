import { describe, it, expect, vi } from 'vitest'
import { logFeatureFlagStates } from './log-feature-flag-states.js'

describe('logFeatureFlagStates', () => {
  it('logs every feature flag name and value on a single info line', () => {
    const config = {
      get: vi.fn().mockReturnValue({
        devEndpoints: false,
        reports: true,
        allowSensitiveLogs: false
      })
    }
    const logger = { info: vi.fn() }

    logFeatureFlagStates(config, logger)

    expect(config.get).toHaveBeenCalledWith('featureFlags')
    expect(logger.info).toHaveBeenCalledTimes(1)
    const [logged] = logger.info.mock.calls[0]
    expect(logged.message).toBe(
      'Feature flags: devEndpoints=false reports=true allowSensitiveLogs=false'
    )
    expect(logged.event).toEqual({ category: 'configuration' })
  })

  it('handles an empty feature flag set', () => {
    const config = { get: vi.fn().mockReturnValue({}) }
    const logger = { info: vi.fn() }

    logFeatureFlagStates(config, logger)

    const [logged] = logger.info.mock.calls[0]
    expect(logged.message).toBe('Feature flags: ')
  })
})
