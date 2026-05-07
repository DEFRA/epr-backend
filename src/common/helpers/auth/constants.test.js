import { describe, test, expect } from 'vitest'

import { ADMIN_ROLES, SCOPES } from './constants.js'

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
