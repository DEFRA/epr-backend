import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

import { getEntraUserRoles } from './get-entra-user-roles.js'
import { ROLES } from './constants.js'

const mockConfigGet = vi.fn()

vi.mock('../../../config.js', () => ({
  getConfig: () => ({
    get: (...args) => mockConfigGet(...args)
  })
}))

describe('#getEntraUserRoles', () => {
  const mockServiceMaintainersList = [
    'maintainer1@example.com',
    'maintainer2@example.com',
    'admin@defra.gov.uk'
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfigGet.mockReturnValue(JSON.stringify(mockServiceMaintainersList))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when user is a service maintainer', () => {
    test('returns service maintainer role when email matches', async () => {
      const tokenPayload = {
        email: 'maintainer1@example.com',
        preferred_username: 'user123'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
      expect(mockConfigGet).toHaveBeenCalledWith('roles.serviceMaintainers')
      expect(mockConfigGet).toHaveBeenCalledTimes(1)
    })

    test('returns service maintainer role when preferred_username matches', async () => {
      const tokenPayload = {
        preferred_username: 'maintainer2@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('uses email over preferred_username when both are present', async () => {
      const tokenPayload = {
        email: 'maintainer1@example.com',
        preferred_username: 'not-a-maintainer@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('handles case-insensitive email matching - uppercase', async () => {
      const tokenPayload = {
        email: 'MAINTAINER1@EXAMPLE.COM'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('handles case-insensitive email matching - mixed case', async () => {
      const tokenPayload = {
        email: 'MaInTaInEr1@ExAmPlE.cOm'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('handles case-insensitive email matching - preferred_username uppercase', async () => {
      const tokenPayload = {
        preferred_username: 'MAINTAINER2@EXAMPLE.COM'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('returns service maintainer role for last email in list', async () => {
      const tokenPayload = {
        email: 'admin@defra.gov.uk'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })
  })

  describe('when user is not a service maintainer', () => {
    test('returns empty array when email does not match any maintainer', async () => {
      const tokenPayload = {
        email: 'regular-user@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
    })

    test('returns empty array when preferred_username does not match', async () => {
      const tokenPayload = {
        preferred_username: 'unknown-user@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
    })

    test('returns empty array when service maintainers list is empty', async () => {
      mockConfigGet.mockReturnValue(JSON.stringify([]))

      const tokenPayload = {
        email: 'user@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
    })
  })

  describe('edge cases', () => {
    test('handles token payload with only preferred_username', async () => {
      const tokenPayload = {
        preferred_username: 'maintainer1@example.com',
        sub: 'user-id-123',
        oid: 'object-id-456'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('handles token payload with empty email string falls back to preferred_username', async () => {
      const tokenPayload = {
        email: '',
        preferred_username: 'maintainer1@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      // Empty string is falsy, so it falls back to preferred_username
      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('handles token payload with null email falls back to preferred_username', async () => {
      const tokenPayload = {
        email: null,
        preferred_username: 'maintainer1@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      // null is falsy, so it falls back to preferred_username
      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('handles token payload with undefined email', async () => {
      const tokenPayload = {
        email: undefined,
        preferred_username: 'maintainer1@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('handles token payload with both email and preferred_username undefined', async () => {
      const tokenPayload = {
        email: undefined,
        preferred_username: undefined
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
    })

    test('handles token payload with no email or preferred_username fields', async () => {
      const tokenPayload = {
        sub: 'user-id-123'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
    })

    test('handles whitespace in email addresses', async () => {
      const tokenPayload = {
        email: ' maintainer1@example.com '
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
    })

    test('handles token payload where userEmail is undefined and list has items', async () => {
      // This tests the branch where serviceMaintainersList.some is called
      // but userEmail is undefined, so the comparison never matches
      mockConfigGet.mockReturnValue(
        JSON.stringify(['maintainer@example.com', 'admin@example.com'])
      )

      const tokenPayload = {
        // Both email and preferred_username are undefined
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
      expect(mockConfigGet).toHaveBeenCalledWith('roles.serviceMaintainers')
    })

    test('handles service maintainers list with single email', async () => {
      mockConfigGet.mockReturnValue(JSON.stringify(['single@example.com']))

      const tokenPayload = {
        email: 'single@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('does not mutate the original token payload', async () => {
      const tokenPayload = {
        email: 'maintainer1@example.com',
        preferred_username: 'user123'
      }
      const originalPayload = { ...tokenPayload }

      await getEntraUserRoles(tokenPayload)

      expect(tokenPayload).toEqual(originalPayload)
    })
  })

  describe('config integration', () => {
    test('calls getConfig with correct key', async () => {
      const tokenPayload = {
        email: 'test@example.com'
      }

      await getEntraUserRoles(tokenPayload)

      expect(mockConfigGet).toHaveBeenCalledWith('roles.serviceMaintainers')
    })

    test('handles valid JSON string from config', async () => {
      const maintainers = ['user1@example.com', 'user2@example.com']
      mockConfigGet.mockReturnValue(JSON.stringify(maintainers))

      const tokenPayload = {
        email: 'user1@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('handles complex email addresses', async () => {
      const complexEmails = [
        'first.last+tag@subdomain.example.com',
        'user_name@example.co.uk'
      ]
      mockConfigGet.mockReturnValue(JSON.stringify(complexEmails))

      const tokenPayload = {
        email: 'first.last+tag@subdomain.example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([ROLES.serviceMaintainer])
    })
  })

  describe('return value structure', () => {
    test('returns a fresh array instance each time', async () => {
      const tokenPayload = {
        email: 'maintainer1@example.com'
      }

      const result1 = await getEntraUserRoles(tokenPayload)
      const result2 = await getEntraUserRoles(tokenPayload)

      expect(result1).not.toBe(result2)
      expect(result1).toEqual(result2)
    })

    test('returns array that can be safely mutated', async () => {
      const tokenPayload = {
        email: 'maintainer1@example.com'
      }

      const result = await getEntraUserRoles(tokenPayload)
      result.push('extra-role')

      const result2 = await getEntraUserRoles(tokenPayload)

      expect(result2).toEqual([ROLES.serviceMaintainer])
      expect(result2).not.toContain('extra-role')
    })
  })

  describe('concurrent calls', () => {
    test('handles multiple concurrent calls correctly', async () => {
      const tokenPayload1 = { email: 'maintainer1@example.com' }
      const tokenPayload2 = { email: 'regular@example.com' }
      const tokenPayload3 = { email: 'maintainer2@example.com' }

      const [result1, result2, result3] = await Promise.all([
        getEntraUserRoles(tokenPayload1),
        getEntraUserRoles(tokenPayload2),
        getEntraUserRoles(tokenPayload3)
      ])

      expect(result1).toEqual([ROLES.serviceMaintainer])
      expect(result2).toEqual([])
      expect(result3).toEqual([ROLES.serviceMaintainer])
    })
  })
})
