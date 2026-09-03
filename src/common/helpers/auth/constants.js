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
  organisationSearch: 'organisation.search',
  wasteBalanceLedgerRead: 'waste-balance.ledger.read',
  summaryLogRead: 'summary-log.read'
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

export const REGULATOR_SCOPES = [
  SCOPES.organisationRead,
  SCOPES.organisationSearch,
  SCOPES.wasteBalanceLedgerRead,
  SCOPES.summaryLogRead
]

/**
 * Admin role → scope-bundle map. Used internally by getEntraUserRoles to
 * resolve an email-list match to its scope set; role names do not flow onto
 * credentials or out over the wire.
 *
 * Every tier reads, so every tier holds `organisation.read` and
 * `waste-balance.ledger.read`. A tier reaches a route by holding the scopes
 * that route requires, never by the route naming the tier.
 */
export const ADMIN_ROLES = {
  service_maintainer_write: [
    SCOPES.adminRead,
    SCOPES.adminWrite,
    SCOPES.adminDlqPurge,
    SCOPES.organisationSearch,
    SCOPES.organisationRead,
    SCOPES.wasteBalanceLedgerRead,
    SCOPES.summaryLogRead
  ],
  service_maintainer: [
    SCOPES.adminRead,
    SCOPES.adminDlqPurge,
    SCOPES.organisationSearch,
    SCOPES.organisationRead,
    SCOPES.wasteBalanceLedgerRead,
    SCOPES.summaryLogRead
  ],
  support: [
    SCOPES.adminRead,
    SCOPES.organisationSearch,
    SCOPES.organisationRead,
    SCOPES.wasteBalanceLedgerRead,
    SCOPES.summaryLogRead
  ]
}
