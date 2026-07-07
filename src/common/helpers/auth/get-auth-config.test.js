import { describe, it, expect } from 'vitest'

import { getAuthConfig } from './get-auth-config.js'

describe('getAuthConfig', () => {
  it('returns auth config with scopes', () => {
    expect(getAuthConfig(['scope-1'])).toEqual({
      scope: ['scope-1']
    })
  })

  it('passes through multiple scopes', () => {
    expect(getAuthConfig(['scope-1', 'scope-2'])).toEqual({
      scope: ['scope-1', 'scope-2']
    })
  })
})
