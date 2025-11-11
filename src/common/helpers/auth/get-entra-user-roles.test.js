import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

import { getEntraUserRoles } from './get-entra-user-roles.js'

const mockConfigGet = vi.fn()

vi.mock('../../../config.js', () => ({
  getConfig: () => ({
    get: (...args) => mockConfigGet(...args)
  })
}))

describe('#getEntraUserRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when user has matching roles', () => {
    test('returns user roles when email matches groups', async () => {
      const userRolesConfig = JSON.stringify({
        admin: ['user@example.com', 'admin@example.com'],
        user: ['user@example.com', 'viewer@example.com']
      })
      mockConfigGet.mockReturnValue(userRolesConfig)

      const tokenPayload = { email: 'user@example.com' }
      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual(['admin', 'user'])
      expect(mockConfigGet).toHaveBeenCalledWith('userRoles')
    })

    test('returns user roles when preferred_username matches groups', async () => {
      const userRolesConfig = JSON.stringify({
        admin: ['user@test.com', 'admin@test.com'],
        user: ['user@test.com', 'viewer@test.com']
      })
      mockConfigGet.mockReturnValue(userRolesConfig)

      const tokenPayload = { preferred_username: 'user@test.com' }
      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual(['admin', 'user'])
      expect(mockConfigGet).toHaveBeenCalledWith('userRoles')
    })

    test('prefers email over preferred_username when both are present', async () => {
      const userRolesConfig = JSON.stringify({
        admin: ['email@example.com'],
        user: ['username@example.com']
      })
      mockConfigGet.mockReturnValue(userRolesConfig)

      const tokenPayload = {
        email: 'email@example.com',
        preferred_username: 'username@example.com'
      }
      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual(['admin'])
    })
  })

  describe('when user has no matching roles', () => {
    test('returns empty array when user email is not in any groups', async () => {
      const userRolesConfig = JSON.stringify({
        admin: ['admin@example.com'],
        user: ['user@example.com']
      })
      mockConfigGet.mockReturnValue(userRolesConfig)

      const tokenPayload = { email: 'unknown@example.com' }
      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
      expect(mockConfigGet).toHaveBeenCalledWith('userRoles')
    })

    test('returns empty array when user has no email or preferred_username', async () => {
      const userRolesConfig = JSON.stringify({
        admin: ['admin@example.com'],
        user: ['user@example.com']
      })
      mockConfigGet.mockReturnValue(userRolesConfig)

      const tokenPayload = {}
      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
      expect(mockConfigGet).toHaveBeenCalledWith('userRoles')
    })
  })

  describe('when JSON parsing fails', () => {
    test('throws Boom badImplementation error when userRoles config is invalid JSON', async () => {
      mockConfigGet.mockReturnValue('invalid json string')

      const tokenPayload = { email: 'user@example.com' }

      await expect(getEntraUserRoles(tokenPayload)).rejects.toMatchObject({
        isBoom: true,
        message: 'Error parsing user roles configuration',
        output: {
          statusCode: 500
        }
      })
      expect(mockConfigGet).toHaveBeenCalledWith('userRoles')
    })

    test('throws Boom badImplementation error when userRoles config is empty', async () => {
      mockConfigGet.mockReturnValue('')

      const tokenPayload = { email: 'user@example.com' }

      await expect(getEntraUserRoles(tokenPayload)).rejects.toMatchObject({
        isBoom: true,
        message: 'Error parsing user roles configuration',
        output: {
          statusCode: 500
        }
      })
    })
  })

  describe('edge cases', () => {
    test('handles empty groups object', async () => {
      const userRolesConfig = JSON.stringify({})
      mockConfigGet.mockReturnValue(userRolesConfig)

      const tokenPayload = { email: 'user@example.com' }
      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual([])
    })

    test('handles groups with empty arrays', async () => {
      const userRolesConfig = JSON.stringify({
        admin: [],
        user: ['user@example.com']
      })
      mockConfigGet.mockReturnValue(userRolesConfig)

      const tokenPayload = { email: 'user@example.com' }
      const result = await getEntraUserRoles(tokenPayload)

      expect(result).toEqual(['user'])
    })
  })
})