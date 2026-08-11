import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

import { getEntraUserRoles } from './get-entra-user-roles.js'
import {
  ADMIN_ROLES,
  REGULATOR_APP_ROLE,
  REGULATOR_ROLE,
  REGULATOR_SCOPES,
  SCOPES
} from './constants.js'

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

  describe('regulator app role', () => {
    test('returns the regulator role for a token carrying the regulator app role', async () => {
      const result = await getEntraUserRoles('regulator@test.gov.uk', [
        REGULATOR_APP_ROLE
      ])

      expect(result).toEqual({
        role: REGULATOR_ROLE,
        scopes: [...REGULATOR_SCOPES]
      })
    })

    test('grants a regulator organisation.read for any organisation, with no request in hand', async () => {
      const result = await getEntraUserRoles('regulator@test.gov.uk', [
        REGULATOR_APP_ROLE
      ])

      expect(result.scopes).toContain(SCOPES.organisationRead)
    })

    test('grants a regulator no write scope', async () => {
      const result = await getEntraUserRoles('regulator@test.gov.uk', [
        REGULATOR_APP_ROLE
      ])

      expect(result.scopes).not.toContain(SCOPES.organisationWrite)
      expect(result.scopes).not.toContain(SCOPES.adminWrite)
    })

    test('resolves the regulator role alongside other app roles on the token', async () => {
      const result = await getEntraUserRoles('regulator@test.gov.uk', [
        'Some.Other.Role',
        REGULATOR_APP_ROLE
      ])

      expect(result.role).toBe(REGULATOR_ROLE)
    })

    test('resolves the regulator role without an email on the token', async () => {
      const result = await getEntraUserRoles(undefined, [REGULATOR_APP_ROLE])

      expect(result.role).toBe(REGULATOR_ROLE)
    })

    test('ignores an unrelated app role and falls through to the email lists', async () => {
      setListsForRole('support', 'support@example.com')

      const result = await getEntraUserRoles('support@example.com', [
        'EPR.Regulator'
      ])

      expect(result.role).toBe('support')
    })

    test('returns null role for an unrelated app role and an unlisted email', async () => {
      const result = await getEntraUserRoles('nobody@example.com', [
        'EPR.Regulator'
      ])

      expect(result).toEqual({ role: null, scopes: [] })
    })

    test('returns a fresh scopes array each call (mutation safe)', async () => {
      const first = await getEntraUserRoles('regulator@test.gov.uk', [
        REGULATOR_APP_ROLE
      ])
      first.scopes.push('extra')

      const second = await getEntraUserRoles('regulator@test.gov.uk', [
        REGULATOR_APP_ROLE
      ])

      expect(second.scopes).toEqual([...REGULATOR_SCOPES])
    })
  })

  describe('an identity matching more than one rule', () => {
    test('keeps the admin scopes of a service maintainer given the regulator app role', async () => {
      setListsForRole('service_maintainer_write', 'both@example.com')

      const result = await getEntraUserRoles('both@example.com', [
        REGULATOR_APP_ROLE
      ])

      for (const scope of ADMIN_ROLES.service_maintainer_write) {
        expect(result.scopes).toContain(scope)
      }
    })

    test('adds the regulator scopes to a service maintainer given the regulator app role', async () => {
      setListsForRole('service_maintainer_write', 'both@example.com')

      const result = await getEntraUserRoles('both@example.com', [
        REGULATOR_APP_ROLE
      ])

      for (const scope of REGULATOR_SCOPES) {
        expect(result.scopes).toContain(scope)
      }
    })

    test('keeps the admin tier as the role, so a regulator assignment only adds', async () => {
      setListsForRole('support', 'both@example.com')

      const result = await getEntraUserRoles('both@example.com', [
        REGULATOR_APP_ROLE
      ])

      expect(result.role).toBe('support')
    })

    test('lists each scope once', async () => {
      setListsForRole('support', 'both@example.com')

      const result = await getEntraUserRoles('both@example.com', [
        REGULATOR_APP_ROLE
      ])

      expect(result.scopes).toEqual([...new Set(result.scopes)])
    })
  })

  describe('first-match-wins precedence between admin tiers', () => {
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
