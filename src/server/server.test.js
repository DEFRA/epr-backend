import { describe, it, expect } from 'vitest'

import { getConfig } from '#root/config.js'

import { shouldRegisterSummaryLogRowStates } from './server.js'

describe('shouldRegisterSummaryLogRowStates', () => {
  it('defers registration while both row-state flags are off', () => {
    const config = getConfig({
      featureFlags: {
        summaryLogRowStates: false,
        summaryLogRowStatesBackfill: false
      }
    })

    expect(shouldRegisterSummaryLogRowStates(config)).toBe(false)
  })

  it('registers once the write flag is on', () => {
    const config = getConfig({
      featureFlags: {
        summaryLogRowStates: true,
        summaryLogRowStatesBackfill: false
      }
    })

    expect(shouldRegisterSummaryLogRowStates(config)).toBe(true)
  })

  it('registers once the backfill flag is on', () => {
    const config = getConfig({
      featureFlags: {
        summaryLogRowStates: false,
        summaryLogRowStatesBackfill: true
      }
    })

    expect(shouldRegisterSummaryLogRowStates(config)).toBe(true)
  })
})
