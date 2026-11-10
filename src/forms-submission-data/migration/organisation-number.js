import { toOrganisationNumber } from '#domain/organisations/numbers.js'

/** @import {OrganisationNumber} from '#domain/organisations/numbers.js' */

/**
 * The migration carries an organisation's number as the forms submission does,
 * as the numeric `orgId`. The organisations repository takes and gives it as an
 * organisation number.
 */

/**
 * @template {{ organisationNumber: OrganisationNumber }} T
 * @param {T} organisation
 * @returns {Omit<T, 'organisationNumber'> & { orgId: number }}
 */
export const toMigratedOrganisation = ({ organisationNumber, ...rest }) => ({
  ...rest,
  orgId: Number(organisationNumber)
})

/**
 * @template {{ orgId: number }} T
 * @param {T} organisation
 * @returns {Omit<T, 'orgId'> & { organisationNumber: OrganisationNumber }}
 */
export const toRepositoryOrganisation = ({ orgId, ...rest }) => ({
  ...rest,
  organisationNumber: toOrganisationNumber(String(orgId))
})
