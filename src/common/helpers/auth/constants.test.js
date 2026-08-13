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
      SCOPES.adminDlqPurge
    ])
  })

  test('service_maintainer carries admin.read and admin.dlq.purge but not admin.write', () => {
    expect(ADMIN_ROLES.service_maintainer).toEqual([
      SCOPES.adminRead,
      SCOPES.adminDlqPurge
    ])
    expect(ADMIN_ROLES.service_maintainer).not.toContain(SCOPES.adminWrite)
  })

  test('support carries only admin.read', () => {
    expect(ADMIN_ROLES.support).toEqual([SCOPES.adminRead])
  })

  test('every admin role includes admin.read so any tier can call read routes', () => {
    for (const scopes of Object.values(ADMIN_ROLES)) {
      expect(scopes).toContain(SCOPES.adminRead)
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
