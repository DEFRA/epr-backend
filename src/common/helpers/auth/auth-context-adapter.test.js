import { describe, expect, it, beforeEach } from 'vitest'
import { createInMemoryAuthContext } from './auth-context-adapter.js'

describe('createInMemoryAuthContext', () => {
  /** @type {ReturnType<typeof createInMemoryAuthContext>} */
  let authContext

  beforeEach(() => {
    authContext = createInMemoryAuthContext()
  })

  describe('getUserOrgAccess', () => {
    it('returns empty access for unknown user/org combination', async () => {
      const access = await authContext.getUserOrgAccess('unknown', 'org-123')

      expect(access).toEqual({
        roles: [],
        linkedOrgId: null
      })
    })

    it('returns granted access for known user/org combination', async () => {
      authContext.grantAccess('alice', 'org-123', ['standard_user'])

      const access = await authContext.getUserOrgAccess('alice', 'org-123')

      expect(access).toEqual({
        roles: ['standard_user'],
        linkedOrgId: 'org-123'
      })
    })
  })

  describe('grantAccess', () => {
    it('grants access with default standardUser role', async () => {
      authContext.grantAccess('alice', 'org-123')

      const access = await authContext.getUserOrgAccess('alice', 'org-123')

      expect(access).toEqual({
        roles: ['standardUser'],
        linkedOrgId: 'org-123'
      })
    })

    it('grants access with specified roles', async () => {
      authContext.grantAccess('bob', 'org-456', ['admin', 'editor'])

      const access = await authContext.getUserOrgAccess('bob', 'org-456')

      expect(access).toEqual({
        roles: ['admin', 'editor'],
        linkedOrgId: 'org-456'
      })
    })

    it('allows same user to have access to multiple organisations', async () => {
      authContext.grantAccess('alice', 'org-1', ['viewer'])
      authContext.grantAccess('alice', 'org-2', ['editor'])

      const access1 = await authContext.getUserOrgAccess('alice', 'org-1')
      const access2 = await authContext.getUserOrgAccess('alice', 'org-2')

      expect(access1.linkedOrgId).toBe('org-1')
      expect(access2.linkedOrgId).toBe('org-2')
    })
  })
})
