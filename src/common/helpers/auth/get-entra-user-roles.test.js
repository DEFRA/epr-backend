import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

import { getEntraUserRoles } from './get-entra-user-roles.js'
import { ADMIN_ROLES, SCOPES } from './constants.js'

const mockConfigGet = vi.fn()

vi.mock('../../../config.js', () => ({
  getConfig: () => ({
    get: (...args) => mockConfigGet(...args)
  })
}))

const ROLE_CONFIG_KEYS = {
  service_maintainer_write: 'roles.serviceMaintainersWrite',
  service_maintainer: 'roles.serviceMaintainers',
  support: 'roles.support'
}

function setListsForRole(role, email) {
  const lists = {
    'roles.serviceMaintainersWrite': [],
    'roles.serviceMaintainers': [],
    'roles.support': []
  }
  if (role) {
    lists[ROLE_CONFIG_KEYS[role]] = [email]
  }
  mockConfigGet.mockImplementation((key) => JSON.stringify(lists[key]))
}

/**
 * @param {{ write?: string[], maintainer?: string[], support?: string[] }} [lists]
 */
function setListsExplicit({ write = [], maintainer = [], support = [] } = {}) {
  const lists = {
    'roles.serviceMaintainersWrite': write,
    'roles.serviceMaintainers': maintainer,
    'roles.support': support
  }
  mockConfigGet.mockImplementation((key) => JSON.stringify(lists[key]))
}

describe('#getEntraUserRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setListsExplicit()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('single-list membership', () => {
    test('returns service_maintainer_write for an email in the write list', async () => {
      setListsForRole('service_maintainer_write', 'writer@example.com')

      const result = await getEntraUserRoles('writer@example.com')

      expect(result).toEqual({
        role: 'service_maintainer_write',
        scopes: [...ADMIN_ROLES.service_maintainer_write]
      })
    })

    test('returns service_maintainer for an email in the maintainer list only', async () => {
      setListsForRole('service_maintainer', 'maintainer@example.com')

      const result = await getEntraUserRoles('maintainer@example.com')

      expect(result).toEqual({
        role: 'service_maintainer',
        scopes: [...ADMIN_ROLES.service_maintainer]
      })
    })

    test('returns support for an email in the support list only', async () => {
      setListsForRole('support', 'support@example.com')

      const result = await getEntraUserRoles('support@example.com')

      expect(result).toEqual({
        role: 'support',
        scopes: [...ADMIN_ROLES.support]
      })
    })

    test('returns null role and empty scopes for an email in no list', async () => {
      const result = await getEntraUserRoles('unknown@example.com')

      expect(result).toEqual({ role: null, scopes: [] })
    })
  })

  describe('first-match-wins precedence', () => {
    test('write tier wins over maintainer tier when in both lists', async () => {
      setListsExplicit({
        write: ['shared@example.com'],
        maintainer: ['shared@example.com']
      })

      const result = await getEntraUserRoles('shared@example.com')

      expect(result.role).toBe('service_maintainer_write')
    })

    test('write tier wins over support tier when in both lists', async () => {
      setListsExplicit({
        write: ['shared@example.com'],
        support: ['shared@example.com']
      })

      const result = await getEntraUserRoles('shared@example.com')

      expect(result.role).toBe('service_maintainer_write')
    })

    test('maintainer tier wins over support tier when in both lists', async () => {
      setListsExplicit({
        maintainer: ['shared@example.com'],
        support: ['shared@example.com']
      })

      const result = await getEntraUserRoles('shared@example.com')

      expect(result.role).toBe('service_maintainer')
    })

    test('write tier still wins when present in all three lists', async () => {
      setListsExplicit({
        write: ['shared@example.com'],
        maintainer: ['shared@example.com'],
        support: ['shared@example.com']
      })

      const result = await getEntraUserRoles('shared@example.com')

      expect(result.role).toBe('service_maintainer_write')
    })
  })

  describe('case-insensitivity', () => {
    test.each([
      'maintainer@example.com',
      'MAINTAINER@EXAMPLE.COM',
      'MaInTaInEr@ExAmPlE.cOm'
    ])('matches regardless of email casing (%s)', async (queryEmail) => {
      setListsForRole('service_maintainer', 'maintainer@example.com')

      const result = await getEntraUserRoles(queryEmail)

      expect(result.role).toBe('service_maintainer')
    })

    test('matches when stored email is uppercase and query is lowercase', async () => {
      setListsForRole('support', 'SUPPORT@EXAMPLE.COM')

      const result = await getEntraUserRoles('support@example.com')

      expect(result.role).toBe('support')
    })
  })

  describe('edge cases', () => {
    test('returns null role for undefined email', async () => {
      setListsForRole('service_maintainer', 'maintainer@example.com')

      const result = await getEntraUserRoles(undefined)

      expect(result).toEqual({ role: null, scopes: [] })
    })

    test('returns null role for null email', async () => {
      setListsForRole('service_maintainer', 'maintainer@example.com')

      const result = await getEntraUserRoles(null)

      expect(result).toEqual({ role: null, scopes: [] })
    })

    test('does not match emails surrounded by whitespace', async () => {
      setListsForRole('service_maintainer', 'maintainer@example.com')

      const result = await getEntraUserRoles(' maintainer@example.com ')

      expect(result.role).toBeNull()
    })

    test('returns a fresh scopes array each call (mutation safe)', async () => {
      setListsForRole('service_maintainer', 'maintainer@example.com')

      const first = await getEntraUserRoles('maintainer@example.com')
      first.scopes.push('extra')

      const second = await getEntraUserRoles('maintainer@example.com')

      expect(second.scopes).not.toContain('extra')
      expect(second.scopes).toContain(SCOPES.adminRead)
    })
  })

  describe('concurrent calls', () => {
    test('resolves multiple emails correctly in parallel', async () => {
      setListsExplicit({
        write: ['writer@example.com'],
        maintainer: ['maintainer@example.com'],
        support: ['support@example.com']
      })

      const [a, b, c, d] = await Promise.all([
        getEntraUserRoles('writer@example.com'),
        getEntraUserRoles('maintainer@example.com'),
        getEntraUserRoles('support@example.com'),
        getEntraUserRoles('nobody@example.com')
      ])

      expect(a.role).toBe('service_maintainer_write')
      expect(b.role).toBe('service_maintainer')
      expect(c.role).toBe('support')
      expect(d.role).toBeNull()
    })
  })
})
