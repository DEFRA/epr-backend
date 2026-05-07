import { describe, it, expect } from 'vitest'

import { getAuthConfig } from './get-auth-config.js'
import { ROLES, SCOPES } from './constants.js'

describe('getAuthConfig', () => {
  it('returns auth config with scopes', () => {
    expect(getAuthConfig([ROLES.standardUser])).toEqual({
      scope: [ROLES.standardUser]
    })
  })

  it('passes through multiple scopes', () => {
    expect(getAuthConfig([ROLES.standardUser, SCOPES.adminRead])).toEqual({
      scope: [ROLES.standardUser, SCOPES.adminRead]
    })
  })
})
