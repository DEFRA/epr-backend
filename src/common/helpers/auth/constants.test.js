import { describe, test, expect } from 'vitest'

import {
  ADMIN_ROLES,
  REGULATOR_APP_ROLE,
  REGULATOR_ROLE,
  REGULATOR_SCOPES,
  SCOPES
} from './constants.js'

describe('ADMIN_ROLES', () => {
  test('service_maintainer_write bundles all admin scopes', () => {
    expect(ADMIN_ROLES.service_maintainer_write).toEqual([
      SCOPES.adminRead,
      SCOPES.adminWrite,
      SCOPES.adminDlqPurge,
      SCOPES.organisationSearch,
      SCOPES.organisationRead,
      SCOPES.wasteBalanceLedgerRead
    ])
  })

  test('service_maintainer carries admin.read and admin.dlq.purge but not admin.write', () => {
    expect(ADMIN_ROLES.service_maintainer).toEqual([
      SCOPES.adminRead,
      SCOPES.adminDlqPurge,
      SCOPES.organisationSearch,
      SCOPES.organisationRead,
      SCOPES.wasteBalanceLedgerRead
    ])
    expect(ADMIN_ROLES.service_maintainer).not.toContain(SCOPES.adminWrite)
  })

  test('support carries admin.read and no other admin scope', () => {
    expect(ADMIN_ROLES.support).toEqual([
      SCOPES.adminRead,
      SCOPES.organisationSearch,
      SCOPES.organisationRead,
      SCOPES.wasteBalanceLedgerRead
    ])
    expect(ADMIN_ROLES.support).not.toContain(SCOPES.adminWrite)
    expect(ADMIN_ROLES.support).not.toContain(SCOPES.adminDlqPurge)
  })

  test('every admin role includes admin.read', () => {
    for (const scopes of Object.values(ADMIN_ROLES)) {
      expect(scopes).toContain(SCOPES.adminRead)
    }
  })

  test('every tier reads, so every tier holds both scopes a ledger route requires', () => {
    for (const scopes of Object.values(ADMIN_ROLES)) {
      expect(scopes).toContain(SCOPES.organisationRead)
      expect(scopes).toContain(SCOPES.wasteBalanceLedgerRead)
    }
  })

  test('a tier that holds admin.read also holds organisation.search', () => {
    const tiersWithAdminRead = Object.values(ADMIN_ROLES).filter((scopes) =>
      scopes.includes(SCOPES.adminRead)
    )

    for (const scopes of tiersWithAdminRead) {
      expect(scopes).toContain(SCOPES.organisationSearch)
    }
  })
})

describe('the regulator role', () => {
  test('names the Entra app role the regulator frontend assigns', () => {
    expect(REGULATOR_APP_ROLE).toBe('Waste.Regulator.Standard')
  })

  test('carries organisation.read, the scope operator read routes already declare', () => {
    expect(REGULATOR_SCOPES).toContain(SCOPES.organisationRead)
  })

  test('carries the coarse regulator scope for what only a regulator does', () => {
    expect(REGULATOR_SCOPES).toContain(SCOPES.regulator)
  })

  test('carries organisation.search, which enumerates operators the regulator holds no id for', () => {
    expect(REGULATOR_SCOPES).toContain(SCOPES.organisationSearch)
  })

  test('carries waste-balance.ledger.read, which organisation.read must not admit', () => {
    expect(REGULATOR_SCOPES).toContain(SCOPES.wasteBalanceLedgerRead)
  })

  test('spells that scope the way the frontend declares it on its own gate', () => {
    expect(SCOPES.wasteBalanceLedgerRead).toBe('waste-balance.ledger.read')
  })

  test('carries no admin scope', () => {
    expect(REGULATOR_SCOPES).not.toContain(SCOPES.adminRead)
    expect(REGULATOR_SCOPES).not.toContain(SCOPES.adminWrite)
    expect(REGULATOR_SCOPES).not.toContain(SCOPES.adminDlqPurge)
  })

  test('carries no write scope, because a regulator changes nothing', () => {
    expect(REGULATOR_SCOPES).not.toContain(SCOPES.organisationWrite)
    expect(REGULATOR_SCOPES).not.toContain(SCOPES.organisationLinkedWrite)
  })

  test('carries no linked-organisation scope, which concerns the links of an operator', () => {
    expect(REGULATOR_SCOPES).not.toContain(SCOPES.organisationLinkedRead)
  })

  test('is reported as its own role, distinct from every admin tier', () => {
    expect(REGULATOR_ROLE).toBe('regulator_standard')
    expect(Object.keys(ADMIN_ROLES)).not.toContain(REGULATOR_ROLE)
  })
})
