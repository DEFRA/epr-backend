import { describe, it, expect } from 'vitest'

import { getAuthConfig } from './get-auth-config.js'
import { ROLES } from './constants.js'

describe('getAuthConfig', () => {
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
