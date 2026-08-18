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
 * `organisation.search` is separate from `organisation.read` because a search
 * enumerates the population of operators: the caller holds no organisation id
 * yet, so the condition an operator's `organisation.read` carries — their own
 * linked organisation — cannot apply.
 *
 * `waste-balance.ledger.read` covers the ledger behind a waste balance: the
 * service's own record of how the balance moved, event by event. An operator
 * reads the balance, and does not read the ledger.
 *
 * `organisation.read` cannot draw that line. An operator earns it for the
 * organisation named in the request, and the ledger routes name one, so a
 * ledger route that admits `organisation.read` admits the operator too.
 *
 * `regulator` is coarse on purpose. It stands for the whole set of functions
 * only a regulator performs, and subdivides when caseworking functions
 * arrive.
 *
 * A regulator reads and changes nothing, so no write scope appears here.
 */
export const REGULATOR_SCOPES = [
  SCOPES.organisationRead,
  SCOPES.organisationSearch,
  SCOPES.wasteBalanceLedgerRead,
  SCOPES.regulator
]

/**
 * Admin role → scope-bundle map. Used internally by getEntraUserRoles to
 * resolve an email-list match to its scope set; role names do not flow onto
 * credentials or out over the wire.
 */
export const ADMIN_ROLES = {
  service_maintainer_write: [
    SCOPES.adminRead,
    SCOPES.adminWrite,
    SCOPES.adminDlqPurge,
    SCOPES.organisationSearch
  ],
  service_maintainer: [
    SCOPES.adminRead,
    SCOPES.adminDlqPurge,
    SCOPES.organisationSearch
  ],
  support: [SCOPES.adminRead, SCOPES.organisationSearch]
}
