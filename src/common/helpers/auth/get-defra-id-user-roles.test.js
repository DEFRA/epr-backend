import { describe, test, expect } from 'vitest'

import { getDefraIdUserRoles } from './get-defra-id-user-roles.js'
import { ROLES } from './constants.js'

describe('#getDefraIdUserRoles', () => {
  describe('when user is initial user', () => {
    test('returns initialUser role when user email matches and isInitialUser is true', () => {
      const linkedEprOrg = {
        users: [
          { email: 'user@example.com', isInitialUser: true },
          { email: 'other@example.com', isInitialUser: false }
        ]
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([ROLES.initialUser])
    })

    test('returns initialUser role for single user organisation', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: true }]
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([ROLES.initialUser])
    })

    test('returns initialUser role when multiple users but only one is initial', () => {
      const linkedEprOrg = {
        users: [
          { email: 'regular@example.com', isInitialUser: false },
          { email: 'initial@example.com', isInitialUser: true },
          { email: 'another@example.com', isInitialUser: false }
        ]
      }
      const tokenPayload = {
        email: 'initial@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([ROLES.initialUser])
    })
  })

  describe('when user is not initial user', () => {
    test('returns empty array when user is not initial user', () => {
      const linkedEprOrg = {
        users: [
          { email: 'user@example.com', isInitialUser: false },
          { email: 'other@example.com', isInitialUser: true }
        ]
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })

    test('returns empty array when user email not found in organisation', () => {
      const linkedEprOrg = {
        users: [{ email: 'other@example.com', isInitialUser: true }]
      }
      const tokenPayload = {
        email: 'notfound@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })

    test('returns empty array when organisation has no users', () => {
      const linkedEprOrg = {
        users: []
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })

    test('returns empty array when isInitialUser is null', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: null }]
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })

    test('returns empty array when isInitialUser is undefined', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: undefined }]
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })

    test('returns empty array when isInitialUser is false', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: false }]
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })
  })

  describe('edge cases with linkedEprOrg', () => {
    test('throws error when linkedEprOrg is undefined', () => {
      const linkedEprOrg = undefined
      const tokenPayload = {
        email: 'user@example.com'
      }

      expect(() => getDefraIdUserRoles(linkedEprOrg, tokenPayload)).toThrow()
    })

    test('throws error when linkedEprOrg is null', () => {
      const linkedEprOrg = null
      const tokenPayload = {
        email: 'user@example.com'
      }

      expect(() => getDefraIdUserRoles(linkedEprOrg, tokenPayload)).toThrow()
    })

    test('throws error when linkedEprOrg has no users property', () => {
      const linkedEprOrg = {
        id: 'org-123',
        name: 'Test Org'
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      expect(() => getDefraIdUserRoles(linkedEprOrg, tokenPayload)).toThrow()
    })
  })

  describe('edge cases with tokenPayload', () => {
    test('returns empty array when email is missing from token', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: true }]
      }
      const tokenPayload = {}

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })

    test('returns empty array when email is null in token', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: true }]
      }
      const tokenPayload = {
        email: null
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })

    test('returns initialUser when email is empty string in token and matches', () => {
      const linkedEprOrg = {
        users: [{ email: '', isInitialUser: true }]
      }
      const tokenPayload = {
        email: ''
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([ROLES.initialUser])
    })

    test('returns empty array when email is undefined in token', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: true }]
      }
      const tokenPayload = {
        email: undefined
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })
  })

  describe('email matching', () => {
    test('performs exact email matching', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: true }]
      }
      const tokenPayload = {
        email: 'User@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })

    test('does not trim whitespace in email matching', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: true }]
      }
      const tokenPayload = {
        email: ' user@example.com '
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([])
    })

    test('handles complex email addresses', () => {
      const linkedEprOrg = {
        users: [
          {
            email: 'first.last+tag@subdomain.example.com',
            isInitialUser: true
          }
        ]
      }
      const tokenPayload = {
        email: 'first.last+tag@subdomain.example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result).toEqual([ROLES.initialUser])
    })
  })

  describe('return value', () => {
    test('returns a fresh array instance each time', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: true }]
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      const result1 = getDefraIdUserRoles(linkedEprOrg, tokenPayload)
      const result2 = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result1).not.toBe(result2)
      expect(result1).toEqual(result2)
    })

    test('returns array that can be safely mutated', () => {
      const linkedEprOrg = {
        users: [{ email: 'user@example.com', isInitialUser: true }]
      }
      const tokenPayload = {
        email: 'user@example.com'
      }

      const result = getDefraIdUserRoles(linkedEprOrg, tokenPayload)
      result.push('extra-role')

      const result2 = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

      expect(result2).toEqual([ROLES.initialUser])
      expect(result2).not.toContain('extra-role')
    })
  })
})
