import { toOrganisationNumber } from '#domain/organisations/numbers.js'

/** @import {OrganisationNumber} from '#domain/organisations/numbers.js' */

/**
 * The admin API and the audit trail carry a whole organisation with its number
 * as the numeric `orgId`, as the admin frontend reads and writes it.
 *
 * @template {{ organisationNumber: OrganisationNumber }} T
 * @param {T} organisation
 * @returns {Omit<T, 'organisationNumber'> & { orgId: number }}
 */
export const toOrganisationWire = ({ organisationNumber, ...rest }) => ({
  ...rest,
  orgId: Number(organisationNumber)
})

/**
 * @template {object} T
 * @param {T & { orgId?: number }} fields
 * @returns {Omit<T, 'orgId'> & { organisationNumber?: OrganisationNumber }}
 */
export const fromOrganisationWire = ({ orgId, ...rest }) =>
  orgId === undefined
    ? rest
    : { ...rest, organisationNumber: toOrganisationNumber(String(orgId)) }
