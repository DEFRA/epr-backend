import { describe, it, expect } from 'vitest'

import { config } from '#root/config.js'
import { getAuthConfig } from './get-auth-config.js'
import { ROLES } from './constants.js'

describe('getAuthConfig', () => {
  describe('when defraIdAuth is enabled', () => {
    beforeEach(() => {
      config.set('featureFlags.defraIdAuth', true)
    })

    it('returns auth config with scopes', () => {
      expect(getAuthConfig([ROLES.standardUser])).toEqual({
        scope: [ROLES.standardUser]
      })
    })

    it('passes through multiple scopes', () => {
      expect(
        getAuthConfig([ROLES.standardUser, ROLES.serviceMaintainer])
      ).toEqual({
        scope: [ROLES.standardUser, ROLES.serviceMaintainer]
      })
    })
  })

  describe('when defraIdAuth is disabled', () => {
    beforeEach(() => {
      config.set('featureFlags.defraIdAuth', false)
    })

    it('returns false', () => {
      expect(getAuthConfig([ROLES.standardUser])).toBe(false)
    })
  })
})
