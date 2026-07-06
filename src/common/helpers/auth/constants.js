/**
 * Per-request operator-side gates (issued by `getDefraUserRoles` from the
 * request context). Distinct from the durable admin scopes in `SCOPES` below.
 * @typedef {typeof ROLES[keyof typeof ROLES]} Roles
 */
export const ROLES = {
  standardUser: 'standard_user'
}

/**
 * @typedef {typeof SCOPES[keyof typeof SCOPES]} Scopes
 */
export const SCOPES = {
  adminRead: 'admin.read',
  adminWrite: 'admin.write',
  adminDlqPurge: 'admin.dlq.purge',
  organisationRead: 'organisation.read',
  organisationLinkedRead: 'organisation.linked.read',
  organisationLinkedWrite: 'organisation.linked.write'
}

/**
 * Admin role → scope-bundle map. Used internally by getEntraUserRoles to
 * resolve an email-list match to its scope set; role names do not flow onto
 * credentials or out over the wire.
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
