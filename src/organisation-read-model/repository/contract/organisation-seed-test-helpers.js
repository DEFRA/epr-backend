import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

/** @import { OrganisationSeed } from '../port.contract.js' */

/** The year of every accreditation a seed gives. */
export const SEED_ACCREDITATION_YEAR = 2026

let sequence = 700000

const next = () => {
  const value = sequence
  sequence += 1
  return value
}

/** @returns {OrganisationSeed['organisationNumber']} */
export const nextSeedOrganisationNumber = () =>
  toOrganisationNumber(String(next()))

/** @returns {OrganisationSeed['registrations'][number]['registrationNumber']} */
export const nextSeedRegistrationNumber = () =>
  toRegistrationNumber(`R26ER${next()}PL`)

/** @returns {NonNullable<OrganisationSeed['registrations'][number]['accreditationNumber']>} */
export const nextSeedAccreditationNumber = () =>
  toAccreditationNumber(`A26ER${next()}PL`)

/**
 * An organisation with the given name and one registration, under numbers no
 * other seed holds unless given.
 *
 * @param {string} name
 * @param {Partial<OrganisationSeed>} [overrides]
 * @returns {OrganisationSeed}
 */
export const seedNamed = (name, overrides = {}) => ({
  name,
  organisationNumber: nextSeedOrganisationNumber(),
  registrations: [{ registrationNumber: nextSeedRegistrationNumber() }],
  ...overrides
})
