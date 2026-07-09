import { describe, it, expect } from 'vitest'

import { getConfig } from '#root/config.js'

import { shouldRegisterSummaryLogRowStates } from './server.js'

describe('shouldRegisterSummaryLogRowStates', () => {
  it('defers registration while the row-state flag is off', () => {
    const config = getConfig({
      featureFlags: {
        summaryLogRowStates: false
      }
    })

    expect(shouldRegisterSummaryLogRowStates(config)).toBe(false)
  })

  it('registers once the write flag is on', () => {
    const config = getConfig({
      featureFlags: {
        summaryLogRowStates: true
      }
    })

    expect(shouldRegisterSummaryLogRowStates(config)).toBe(true)
  })
})
