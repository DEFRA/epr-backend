/**
 * @typedef {typeof ROLES[keyof typeof ROLES]} Roles
 */
export const ROLES = {
  serviceMaintainer: 'service_maintainer',
  standardUser: 'standard_user',
  inquirer: 'inquirer',
  linker: 'linker'
}

/**
 * @typedef {typeof SCOPES[keyof typeof SCOPES]} Scopes
 */
export const SCOPES = {
  adminRead: 'admin.read',
  adminWrite: 'admin.write',
  adminDlqPurge: 'admin.dlq.purge'
}

/**
 * Admin role → scope-bundle map. Role names are deliberately snake_case strings:
 * they are stable wire identifiers (returned by GET /v1/admin/me) and i18n
 * lookup keys for the admin-frontend tier label.
 */
export const ADMIN_ROLES = {
  service_maintainer_write: [
    SCOPES.adminRead,
    SCOPES.adminWrite,
    SCOPES.adminDlqPurge
  ],
  service_maintainer: [SCOPES.adminRead, SCOPES.adminDlqPurge],
  support: [SCOPES.adminRead]
}
