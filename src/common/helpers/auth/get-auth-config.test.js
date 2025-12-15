import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { ROLES } from './constants.js'

describe('getAuthConfig', () => {
  let originalEnv

  beforeEach(() => {
    originalEnv = process.env.FEATURE_FLAG_DEFRA_ID_AUTH
    vi.resetModules()
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.FEATURE_FLAG_DEFRA_ID_AUTH = originalEnv
    } else {
      delete process.env.FEATURE_FLAG_DEFRA_ID_AUTH
    }
  })

  it('returns auth config with scopes when defraIdAuth is enabled', async () => {
    process.env.FEATURE_FLAG_DEFRA_ID_AUTH = 'true'

    const { getAuthConfig } = await import('./get-auth-config.js')

    expect(getAuthConfig([ROLES.standardUser])).toEqual({
      scope: [ROLES.standardUser]
    })
  })

  it('returns false when defraIdAuth is disabled', async () => {
    process.env.FEATURE_FLAG_DEFRA_ID_AUTH = 'false'

    const { getAuthConfig } = await import('./get-auth-config.js')

    expect(getAuthConfig([ROLES.standardUser])).toBe(false)
  })

  it('returns false when defraIdAuth is not set (defaults to false)', async () => {
    delete process.env.FEATURE_FLAG_DEFRA_ID_AUTH

    const { getAuthConfig } = await import('./get-auth-config.js')

    expect(getAuthConfig([ROLES.standardUser])).toBe(false)
  })

  it('passes through multiple scopes', async () => {
    process.env.FEATURE_FLAG_DEFRA_ID_AUTH = 'true'

    const { getAuthConfig } = await import('./get-auth-config.js')

    expect(
      getAuthConfig([ROLES.standardUser, ROLES.serviceMaintainer])
    ).toEqual({
      scope: [ROLES.standardUser, ROLES.serviceMaintainer]
    })
  })
})
