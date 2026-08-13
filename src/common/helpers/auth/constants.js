/**
 * @typedef {typeof SCOPES[keyof typeof SCOPES]} Scopes
 */
export const SCOPES = {
  adminRead: 'admin.read',
  adminWrite: 'admin.write',
  adminDlqPurge: 'admin.dlq.purge',
  organisationRead: 'organisation.read',
  organisationWrite: 'organisation.write',
  organisationLinkedRead: 'organisation.linked.read',
  organisationLinkedWrite: 'organisation.linked.write',
  regulator: 'regulator'
}

/**
 * Entra app role that identifies a regulator standard user. It is assigned
 * against the Entra app registration and arrives on the access token's
 * `roles` claim.
 */
export const REGULATOR_APP_ROLE = 'Waste.Regulator.Standard'

/**
 * Role recorded on the credential, and from there on audit and system logs,
 * for a regulator standard user.
 */
export const REGULATOR_ROLE = 'regulator_standard'

/**
 * Scope bundle for a regulator standard user.
 *
 * `organisation.read` is the same scope an operator holds, on a different
 * condition: an operator holds it for their own linked organisation, a
 * regulator holds it for every organisation. So no read route names a
 * regulator, and a read route written later admits one without its author
 * knowing regulators exist.
 *
 * `regulator` is coarse on purpose. It stands for the whole set of functions
 * only a regulator performs, and subdivides when caseworking functions
 * arrive.
 *
 * A regulator reads and changes nothing, so no write scope appears here.
 */
export const REGULATOR_SCOPES = [SCOPES.organisationRead, SCOPES.regulator]

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
