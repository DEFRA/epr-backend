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
  wasteBalanceLedgerRead: 'waste-balance.ledger.read'
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
 * `organisation.search` is separate from `organisation.read` because a search
 * enumerates the population of operators: the caller holds no organisation id
 * yet, so the condition an operator's `organisation.read` carries — their own
 * linked organisation — cannot apply.
 *
 * No operator ever earns `organisation.search`, and every admin tier and the
 * regulator hold it. So a route that requires it alongside `organisation.read`
 * admits a caller who reads any organisation, and refuses one who reads only
 * their own. `admin.read` cannot draw that line, because a regulator does not
 * hold it.
 *
 * `waste-balance.ledger.read` covers the ledger behind a waste balance: the
 * service's own record of how the balance moved, event by event. An operator
 * reads the balance, and does not read the ledger.
 *
 * `organisation.read` cannot draw that line on its own. An operator earns it
 * for the organisation named in the request, and the ledger routes name one.
 * So a ledger route requires both scopes: `organisation.read` for the
 * organisation, and `waste-balance.ledger.read` for the ledger behind it.
 *
 * A regulator reads and changes nothing, so no write scope appears here.
 */
export const REGULATOR_SCOPES = [
  SCOPES.organisationRead,
  SCOPES.organisationSearch,
  SCOPES.wasteBalanceLedgerRead
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
    SCOPES.wasteBalanceLedgerRead
  ],
  service_maintainer: [
    SCOPES.adminRead,
    SCOPES.adminDlqPurge,
    SCOPES.organisationSearch,
    SCOPES.organisationRead,
    SCOPES.wasteBalanceLedgerRead
  ],
  support: [
    SCOPES.adminRead,
    SCOPES.organisationSearch,
    SCOPES.organisationRead,
    SCOPES.wasteBalanceLedgerRead
  ]
}
