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
    test.each([
      'maintainer1@example.com', // lowercase
      'MAINTAINER1@EXAMPLE.COM', // uppercase
      'MaInTaInEr1@ExAmPlE.cOm' // mixed case
    ])('returns service maintainer role when (case-insensitive) email matches - %s', async (email) => {
      const result = await getEntraUserRoles(email)

      expect(result).toEqual([ROLES.serviceMaintainer])
      expect(mockConfigGet).toHaveBeenCalledWith('roles.serviceMaintainers')
      expect(mockConfigGet).toHaveBeenCalledTimes(1)
    })

    test('returns service maintainer role for last email in list', async () => {
      const result = await getEntraUserRoles('admin@defra.gov.uk')

      expect(result).toEqual([ROLES.serviceMaintainer])
    })
  })

  describe('when user is not a service maintainer', () => {
    test('returns empty array when email does not match any maintainer', async () => {
      const result = await getEntraUserRoles('regular-user@example.com')

      expect(result).toEqual([])
    })

    test('returns empty array when service maintainers list is empty', async () => {
      mockConfigGet.mockReturnValue(JSON.stringify([]))

      const result = await getEntraUserRoles('user@example.com')

      expect(result).toEqual([])
    })
  })

  describe('edge cases', () => {

    test('handles undefined email', async () => {
      const result = await getEntraUserRoles(undefined)

      expect(result).toEqual([])
    })

    test('handles null email', async () => {
      const result = await getEntraUserRoles(null)

      expect(result).toEqual([])
    })

    test('handles whitespace in email addresses', async () => {
      const result = await getEntraUserRoles(' maintainer1@example.com ')

      expect(result).toEqual([])
    })

    test('handles token payload where userEmail is undefined and list has items', async () => {
      // This tests the branch where serviceMaintainersList.some is called
      // but userEmail is undefined, so the comparison never matches
      mockConfigGet.mockReturnValue(
        JSON.stringify(['maintainer@example.com', 'admin@example.com'])
      )

      const result = await getEntraUserRoles(undefined)

      expect(result).toEqual([])
      expect(mockConfigGet).toHaveBeenCalledWith('roles.serviceMaintainers')
    })

    test('handles service maintainers list with single email', async () => {
      mockConfigGet.mockReturnValue(JSON.stringify(['single@example.com']))

      const result = await getEntraUserRoles('single@example.com')

      expect(result).toEqual([ROLES.serviceMaintainer])
    })
  })

  describe('config integration', () => {
    test('calls getConfig with correct key', async () => {
      await getEntraUserRoles('test@example.com')

      expect(mockConfigGet).toHaveBeenCalledWith('roles.serviceMaintainers')
    })

    test('handles valid JSON string from config', async () => {
      const maintainers = ['user1@example.com', 'user2@example.com']
      mockConfigGet.mockReturnValue(JSON.stringify(maintainers))

      const result = await getEntraUserRoles('user1@example.com')

      expect(result).toEqual([ROLES.serviceMaintainer])
    })

    test('handles complex email addresses', async () => {
      const complexEmails = [
        'first.last+tag@subdomain.example.com',
        'user_name@example.co.uk'
      ]
      mockConfigGet.mockReturnValue(JSON.stringify(complexEmails))

      const result = await getEntraUserRoles('first.last+tag@subdomain.example.com')

      expect(result).toEqual([ROLES.serviceMaintainer])
    })
  })

  describe('return value structure', () => {
    test('returns a fresh array instance each time', async () => {
      const result1 = await getEntraUserRoles('maintainer1@example.com')
      const result2 = await getEntraUserRoles('maintainer1@example.com')

      expect(result1).not.toBe(result2)
      expect(result1).toEqual(result2)
    })

    test('returns array that can be safely mutated', async () => {
      const result = await getEntraUserRoles('maintainer1@example.com')
      result.push('extra-role')

      const result2 = await getEntraUserRoles('maintainer1@example.com')

      expect(result2).toEqual([ROLES.serviceMaintainer])
      expect(result2).not.toContain('extra-role')
    })
  })

  describe('concurrent calls', () => {
    test('handles multiple concurrent calls correctly', async () => {
      const [result1, result2, result3] = await Promise.all([
        getEntraUserRoles('maintainer1@example.com'),
        getEntraUserRoles('regular@example.com'),
        getEntraUserRoles('maintainer2@example.com')
      ])

      expect(result1).toEqual([ROLES.serviceMaintainer])
      expect(result2).toEqual([])
      expect(result3).toEqual([ROLES.serviceMaintainer])
    })
  })
})
