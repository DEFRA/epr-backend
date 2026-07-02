import { describe, it, expect } from 'vitest'

import { getConfig } from '#root/config.js'

import { shouldRegisterWasteRecordStates } from './server.js'

describe('shouldRegisterWasteRecordStates', () => {
  it('defers registration while both row-state flags are off', () => {
    const config = getConfig({
      featureFlags: {
        wasteRecordStates: false,
        wasteRecordStatesBackfill: false
      }
    })

    expect(shouldRegisterWasteRecordStates(config)).toBe(false)
  })

  it('registers once the write flag is on', () => {
    const config = getConfig({
      featureFlags: {
        wasteRecordStates: true,
        wasteRecordStatesBackfill: false
      }
    })

    expect(shouldRegisterWasteRecordStates(config)).toBe(true)
  })

  it('registers once the backfill flag is on', () => {
    const config = getConfig({
      featureFlags: {
        wasteRecordStates: false,
        wasteRecordStatesBackfill: true
      }
    })

    expect(shouldRegisterWasteRecordStates(config)).toBe(true)
  })
})
